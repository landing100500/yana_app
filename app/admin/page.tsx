'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import AdminUsersCharts from './components/AdminUsersCharts';

interface Section {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  total_chunks?: number;
}

type AdminView = 'training' | 'users-charts';

export default function AdminPage() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [sections, setSections] = useState<Section[]>([]);
  const [selectedSection, setSelectedSection] = useState<string>('');
  const [newSectionName, setNewSectionName] = useState('');
  const [newSectionDescription, setNewSectionDescription] = useState('');
  const [showNewSection, setShowNewSection] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [uploadProgressPercent, setUploadProgressPercent] = useState(0);
  const [deletingSection, setDeletingSection] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<AdminView>('training');
  const router = useRouter();

  useEffect(() => {
    checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/admin/auth');
      const data = await response.json();
      if (data.authenticated) {
        setAuthenticated(true);
        loadSections();
      } else {
        setAuthenticated(false);
      }
    } catch (err) {
      setAuthenticated(false);
    }
  };

  const loadSections = async () => {
    try {
      const response = await fetch('/api/admin/sections');
      const data = await response.json();
      if (response.ok) {
        setSections(data.sections || []);
      }
    } catch (err) {
      console.error('Error loading sections:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    try {
      const response = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setAuthenticated(true);
        loadSections();
      } else {
        setError(data.error || 'Неверный логин или пароль');
      }
    } catch (err) {
      setError('Произошла ошибка при входе');
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSectionName.trim()) {
      setError('Введите название раздела');
      return;
    }

    try {
      const response = await fetch('/api/admin/sections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          name: newSectionName.trim(),
          description: newSectionDescription.trim() || null
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSections([...sections, data.section]);
        setNewSectionName('');
        setNewSectionDescription('');
        setShowNewSection(false);
        setSelectedSection(data.section.id);
        setError('');
      } else {
        setError(data.error || 'Ошибка при создании раздела');
      }
    } catch (err) {
      setError('Произошла ошибка при создании раздела');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedSection) {
      setError('Выберите или создайте раздел');
      return;
    }

    setUploading(true);
    setUploadProgress('Загрузка файла...');
    setUploadProgressPercent(0);
    setError('');

    try {
      console.log('[ADMIN] Starting file upload:', {
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        sectionId: selectedSection
      });

      const formData = new FormData();
      formData.append('file', file);
      formData.append('sectionId', selectedSection);

      console.log('[ADMIN] FormData created, sending fetch request...');
      
      const response = await fetch('/api/admin/transcribe', {
        method: 'POST',
        body: formData,
        // Не устанавливаем Content-Type - браузер установит автоматически с boundary
      });

      console.log('[ADMIN] Fetch response received:', {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        hasBody: !!response.body
      });

      if (!response.ok && !response.body) {
        console.error('[ADMIN] Response not OK and no body:', response.status, response.statusText);
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      if (!response.body) {
        console.error('[ADMIN] Response has no body');
        throw new Error('Нет тела ответа от сервера');
      }

      console.log('[ADMIN] Starting to read response stream...');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Сохраняем неполную строку

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              
              if (data.type === 'progress') {
                setUploadProgress(data.message);
                if (data.progress !== undefined) {
                  setUploadProgressPercent(data.progress);
                }
              } else if (data.type === 'success') {
                setUploadProgress(data.message || `Успешно! Создано ${data.chunksCount} чанков с эмбеддингами.`);
                setUploadProgressPercent(100);
                loadSections();
                setTimeout(() => {
                  setUploadProgress('');
                  setUploadProgressPercent(0);
                }, 5000);
              } else if (data.type === 'error') {
                let errorMsg = data.error || 'Ошибка при обработке видео';
                if (data.suggestion) {
                  errorMsg += ` ${data.suggestion}`;
                }
                if (data.fileSize) {
                  errorMsg += ` Размер файла: ${data.fileSize}`;
                }
                setError(errorMsg);
                if (data.details) {
                  console.error('Error details:', data.details);
                }
                setUploadProgress('');
                setUploadProgressPercent(0);
                setUploading(false);
                return; // Прерываем обработку при ошибке
              }
            } catch (parseError) {
              console.warn('Parse error:', parseError, 'Line:', line);
              // Игнорируем ошибки парсинга, но логируем их
            }
          }
        }
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при обработке видео');
      setUploadProgress('');
      setUploadProgressPercent(0);
    } finally {
      setUploading(false);
      // Сбрасываем input
      e.target.value = '';
    }
  };

  const handleDeleteSection = async (sectionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем выбор раздела при клике на удаление

    if (!confirm('Точно уверены, что хотите удалить эту область памяти? Все связанные данные будут удалены.')) {
      return;
    }
    if (!confirm('Подтвердите удаление ещё раз. Это действие нельзя отменить.')) {
      return;
    }

    setDeletingSection(sectionId);
    setError('');

    try {
      const response = await fetch(`/api/admin/sections/${sectionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Удаляем раздел из списка
        setSections(sections.filter(s => s.id !== sectionId));
        // Если удаленный раздел был выбран, сбрасываем выбор
        if (selectedSection === sectionId) {
          setSelectedSection('');
        }
      } else {
        setError(data.error || 'Ошибка при удалении раздела');
      }
    } catch (err: any) {
      setError(err.message || 'Произошла ошибка при удалении раздела');
    } finally {
      setDeletingSection(null);
    }
  };

  if (authenticated === null) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <h1 className={styles.title}>Вход администратора</h1>
          <form onSubmit={handleLogin} className={styles.form}>
            <div className={styles.inputGroup}>
              <input
                type="text"
                placeholder="Логин"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            <div className={styles.inputGroup}>
              <input
                type="password"
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={styles.input}
                required
              />
            </div>
            {error && <div className={styles.error}>{error}</div>}
            <button type="submit" className={styles.button}>
              Войти
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.adminLayout}>
        {/* Боковое меню */}
        <div className={styles.sidebar}>
          <h2 className={styles.sidebarTitle}>Админ-панель</h2>
          <nav className={styles.sidebarNav}>
            <button
              className={`${styles.sidebarItem} ${currentView === 'training' ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentView('training')}
            >
              Обучение ИИ
            </button>
            <button
              className={`${styles.sidebarItem} ${currentView === 'users-charts' ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentView('users-charts')}
            >
              Карты пользователей
            </button>
          </nav>
        </div>

        {/* Основной контент */}
        <div className={styles.mainContent}>
          {currentView === 'training' ? (
            <div className={styles.adminPanel}>
              <h1 className={styles.title}>Панель администратора</h1>
              <p className={styles.subtitle}>Обучение ИИ</p>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Разделы</h2>
          
          {!showNewSection ? (
            <button
              onClick={() => setShowNewSection(true)}
              className={styles.button}
            >
              + Создать новый раздел
            </button>
          ) : (
            <form onSubmit={handleCreateSection} className={styles.form}>
              <input
                type="text"
                placeholder="Название раздела"
                value={newSectionName}
                onChange={(e) => setNewSectionName(e.target.value)}
                className={styles.input}
                autoFocus
              />
              <textarea
                placeholder="Описание раздела (необязательно)"
                value={newSectionDescription}
                onChange={(e) => setNewSectionDescription(e.target.value)}
                className={styles.input}
                rows={3}
              />
              <div className={styles.buttonGroup}>
                <button type="submit" className={styles.button}>
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewSection(false);
                    setNewSectionName('');
                    setNewSectionDescription('');
                  }}
                  className={styles.buttonSecondary}
                >
                  Отмена
                </button>
              </div>
            </form>
          )}

          {sections.length > 0 && (
            <div className={styles.sectionsList}>
              <h3 className={styles.listTitle}>Выберите раздел:</h3>
              {sections.map((section) => (
                <div
                  key={section.id}
                  className={`${styles.sectionItem} ${
                    selectedSection === section.id ? styles.selected : ''
                  }`}
                  onClick={() => setSelectedSection(section.id)}
                >
                  <div className={styles.sectionInfo}>
                    <div className={styles.sectionName}>{section.name}</div>
                    {section.description && (
                      <div className={styles.sectionDescription}>
                        {section.description}
                      </div>
                    )}
                    {section.total_chunks !== undefined && (
                      <div className={styles.sectionStats}>
                        {section.total_chunks} чанков
                      </div>
                    )}
                  </div>
                  <button
                    onClick={(e) => handleDeleteSection(section.id, e)}
                    disabled={deletingSection === section.id}
                    className={styles.deleteButton}
                    title="Удалить раздел"
                  >
                    {deletingSection === section.id ? '...' : '×'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Загрузка видео</h2>
          {!selectedSection ? (
            <p className={styles.hint}>
              Создайте или выберите раздел для загрузки видео
            </p>
          ) : (
            <div className={styles.uploadArea}>
              <input
                type="file"
                id="video-upload"
                accept="video/*,audio/*"
                onChange={handleFileUpload}
                disabled={uploading}
                className={styles.fileInput}
              />
              <label
                htmlFor="video-upload"
                className={`${styles.uploadButton} ${
                  uploading ? styles.disabled : ''
                }`}
              >
                {uploading ? 'Обработка...' : 'Загрузить видео'}
              </label>
              {uploadProgress && (
                <div className={styles.progressContainer}>
                  <div className={styles.progressText}>{uploadProgress}</div>
                  {uploadProgressPercent > 0 && (
                    <div className={styles.progressBar}>
                      <div 
                        className={styles.progressBarFill}
                        style={{ width: `${uploadProgressPercent}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <div className={styles.error}>{error}</div>}
            </div>
          ) : (
            <AdminUsersCharts />
          )}
        </div>
      </div>
    </div>
  );
}
