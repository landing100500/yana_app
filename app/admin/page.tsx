'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';
import AdminUsersCharts from './components/AdminUsersCharts';
import AdminChatHistory from './components/AdminChatHistory';
import AdminPaymentsStats from './components/AdminPaymentsStats';
import AdminMailings from './components/AdminMailings';
import AdminTrialEnd from './components/AdminTrialEnd';
import AdminPartner from './components/AdminPartner';

interface Section {
  id: string;
  name: string;
  description?: string | null;
  created_at: string;
  total_chunks?: number;
  enabled_for_agent?: boolean;
}

type AdminView = 'training' | 'users-charts' | 'chat-history' | 'algorithms' | 'statistics' | 'mailings' | 'trial-end' | 'partner';

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
  const [showTextUpload, setShowTextUpload] = useState(false);
  const [textUploadContent, setTextUploadContent] = useState('');
  const [textUploading, setTextUploading] = useState(false);
  const [agentSectionToConnect, setAgentSectionToConnect] = useState('');
  const [togglingAgent, setTogglingAgent] = useState<string | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editSectionName, setEditSectionName] = useState('');
  const [editSectionDescription, setEditSectionDescription] = useState('');
  const [savingSection, setSavingSection] = useState(false);
  const [personalityReadingAlgorithm, setPersonalityReadingAlgorithm] = useState(false);
  const [algorithmsLoading, setAlgorithmsLoading] = useState(false);
  const [algorithmsSaving, setAlgorithmsSaving] = useState(false);
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
        loadAlgorithmSettings();
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

  const loadAlgorithmSettings = async () => {
    setAlgorithmsLoading(true);
    try {
      const response = await fetch('/api/admin/settings');
      const data = await response.json();
      if (response.ok && typeof data.personalityReadingAlgorithm === 'boolean') {
        setPersonalityReadingAlgorithm(data.personalityReadingAlgorithm);
      }
    } catch (err) {
      console.error('Error loading algorithm settings:', err);
    } finally {
      setAlgorithmsLoading(false);
    }
  };

  const savePersonalityReadingAlgorithm = async (enabled: boolean) => {
    setAlgorithmsSaving(true);
    setError('');
    try {
      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personalityReadingAlgorithm: enabled }),
      });
      const data = await response.json();
      if (response.ok) {
        setPersonalityReadingAlgorithm(!!data.personalityReadingAlgorithm);
      } else {
        setError(data.error || 'Не удалось сохранить настройку');
      }
    } catch (err) {
      setError('Ошибка при сохранении');
    } finally {
      setAlgorithmsSaving(false);
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
        loadAlgorithmSettings();
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

  const handleTextUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSection) {
      setError('Выберите или создайте раздел');
      return;
    }
    const text = textUploadContent.trim();
    if (!text) {
      setError('Введите текст');
      return;
    }
    setTextUploading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/ingest-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: selectedSection, text }),
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error || 'Ошибка при добавлении текста');
        return;
      }
      loadSections();
      setTextUploadContent('');
      setShowTextUpload(false);
      setUploadProgress(data.message || `Добавлено ${data.chunksCount} чанков.`);
      setUploadProgressPercent(100);
      setTimeout(() => {
        setUploadProgress('');
        setUploadProgressPercent(0);
      }, 5000);
    } catch (err: any) {
      setError(err.message || 'Ошибка при добавлении текста');
    } finally {
      setTextUploading(false);
    }
  };

  const handleConnectAgentSection = async (sectionId: string, enabled: boolean) => {
    if (!sectionId) return;
    setTogglingAgent(sectionId);
    setError('');
    try {
      const response = await fetch(`/api/admin/sections/${sectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled_for_agent: enabled }),
      });
      const data = await response.json();
      if (response.ok) {
        setSections((prev) =>
          prev.map((s) => (s.id === sectionId ? { ...s, enabled_for_agent: enabled } : s))
        );
        if (!enabled) setAgentSectionToConnect((prev) => (prev === sectionId ? '' : prev));
      } else {
        setError(data.error || 'Ошибка при обновлении');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка сети');
    } finally {
      setTogglingAgent(null);
    }
  };

  const startEditSection = (section: Section) => {
    setEditingSectionId(section.id);
    setEditSectionName(section.name);
    setEditSectionDescription(section.description ?? '');
  };

  const cancelEditSection = () => {
    setEditingSectionId(null);
    setEditSectionName('');
    setEditSectionDescription('');
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSectionId || !editSectionName.trim()) return;
    setSavingSection(true);
    setError('');
    try {
      const response = await fetch(`/api/admin/sections/${editingSectionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editSectionName.trim(),
          description: editSectionDescription.trim() || null,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setSections((prev) =>
          prev.map((s) =>
            s.id === editingSectionId
              ? { ...s, name: data.section.name, description: data.section.description ?? null }
              : s
          )
        );
        cancelEditSection();
      } else {
        setError(data.error || 'Ошибка при сохранении');
      }
    } catch (err: any) {
      setError(err.message || 'Ошибка сети');
    } finally {
      setSavingSection(false);
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
      <div className={`${styles.container} darkUi`}>
        <div className={styles.loading}>Загрузка...</div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className={`${styles.container} darkUi`}>
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
    <div className={`${styles.container} darkUi`}>
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
              Пользователи
            </button>
            <button
              className={`${styles.sidebarItem} ${currentView === 'chat-history' ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentView('chat-history')}
            >
              История запросов
            </button>
            <button
              className={`${styles.sidebarItem} ${currentView === 'algorithms' ? styles.sidebarItemActive : ''}`}
              onClick={() => {
                setCurrentView('algorithms');
                loadAlgorithmSettings();
              }}
            >
              Алгоритмы
            </button>
            <button
              className={`${styles.sidebarItem} ${currentView === 'statistics' ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentView('statistics')}
            >
              Статистика
            </button>
            <button
              className={`${styles.sidebarItem} ${currentView === 'mailings' ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentView('mailings')}
            >
              Рассылки
            </button>
            <button
              className={`${styles.sidebarItem} ${currentView === 'trial-end' ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentView('trial-end')}
            >
              Завершение пробного
            </button>
            <button
              className={`${styles.sidebarItem} ${currentView === 'partner' ? styles.sidebarItemActive : ''}`}
              onClick={() => setCurrentView('partner')}
            >
              Партнерка
            </button>
          </nav>

          <div className={styles.agentSections}>
            <h3 className={styles.agentSectionsTitle}>Подключение к агенту</h3>
            <p className={styles.agentSectionsHint}>
              Подключённые области памяти доступны ИИ-агенту в чате.
            </p>
            <div className={styles.agentConnectRow}>
              <select
                value={agentSectionToConnect}
                onChange={(e) => setAgentSectionToConnect(e.target.value)}
                className={styles.select}
                disabled={togglingAgent !== null}
              >
                <option value="">Выберите область...</option>
                {sections.filter((s) => !s.enabled_for_agent).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={styles.buttonSmall}
                disabled={!agentSectionToConnect || togglingAgent !== null}
                onClick={() => agentSectionToConnect && handleConnectAgentSection(agentSectionToConnect, true)}
              >
                Подключить
              </button>
            </div>
            <ul className={styles.agentConnectedList}>
              {sections.filter((s) => s.enabled_for_agent).map((s) => (
                <li key={s.id} className={styles.agentConnectedItem}>
                  <span className={styles.agentConnectedName}>{s.name}</span>
                  <button
                    type="button"
                    className={styles.buttonSmallDanger}
                    disabled={togglingAgent !== null}
                    onClick={() => handleConnectAgentSection(s.id, false)}
                    title="Отключить от агента"
                  >
                    {togglingAgent === s.id ? '...' : 'Отключить'}
                  </button>
                </li>
              ))}
            </ul>
          </div>
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
                  } ${editingSectionId === section.id ? styles.sectionItemEditing : ''}`}
                  onClick={() => editingSectionId !== section.id && setSelectedSection(section.id)}
                >
                  {editingSectionId === section.id ? (
                    <form onSubmit={handleSaveSection} className={styles.editSectionForm} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="text"
                        value={editSectionName}
                        onChange={(e) => setEditSectionName(e.target.value)}
                        className={styles.input}
                        placeholder="Название"
                        disabled={savingSection}
                        autoFocus
                      />
                      <textarea
                        value={editSectionDescription}
                        onChange={(e) => setEditSectionDescription(e.target.value)}
                        className={styles.input}
                        placeholder="Описание области памяти (необязательно)"
                        rows={2}
                        disabled={savingSection}
                      />
                      <div className={styles.buttonGroup}>
                        <button type="submit" className={styles.button} disabled={savingSection || !editSectionName.trim()}>
                          {savingSection ? '...' : 'Сохранить'}
                        </button>
                        <button type="button" className={styles.buttonSecondary} onClick={cancelEditSection} disabled={savingSection}>
                          Отмена
                        </button>
                      </div>
                    </form>
                  ) : (
                    <>
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
                      <div className={styles.sectionActions}>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); startEditSection(section); }}
                          className={styles.editButton}
                          title="Редактировать описание"
                        >
                          Изменить
                        </button>
                        <button
                          onClick={(e) => handleDeleteSection(section.id, e)}
                          disabled={deletingSection === section.id || section.enabled_for_agent}
                          className={styles.deleteButton}
                          title={section.enabled_for_agent ? 'Сначала отключите область от агента' : 'Удалить раздел'}
                        >
                          {deletingSection === section.id ? '...' : '×'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>Загрузка видео или аудио</h2>
          {!selectedSection ? (
            <p className={styles.hint}>
              Создайте или выберите раздел для загрузки видео или аудио
            </p>
          ) : (
            <div className={styles.uploadArea}>
              <div className={styles.uploadButtonRow}>
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
                  {uploading ? 'Обработка...' : 'Загрузить видео или аудио'}
                </label>
                <button
                  type="button"
                  className={`${styles.uploadButton} ${styles.uploadButtonSecondary} ${
                    textUploading ? styles.disabled : ''
                  }`}
                  disabled={uploading || textUploading}
                  onClick={() => setShowTextUpload((v) => !v)}
                >
                  {textUploading ? 'Обработка...' : 'Загрузить текст'}
                </button>
              </div>
              {showTextUpload && (
                <form onSubmit={handleTextUpload} className={styles.textUploadForm}>
                  <textarea
                    placeholder="Вставьте текст для добавления в базу знаний..."
                    value={textUploadContent}
                    onChange={(e) => setTextUploadContent(e.target.value)}
                    className={styles.input}
                    rows={6}
                    disabled={textUploading}
                  />
                  <div className={styles.buttonGroup}>
                    <button
                      type="submit"
                      className={styles.button}
                      disabled={textUploading || !textUploadContent.trim()}
                    >
                      {textUploading ? 'Обработка...' : 'Добавить в базу'}
                    </button>
                    <button
                      type="button"
                      className={styles.buttonSecondary}
                      disabled={textUploading}
                      onClick={() => {
                        setShowTextUpload(false);
                        setTextUploadContent('');
                      }}
                    >
                      Отмена
                    </button>
                  </div>
                </form>
              )}
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
          ) : currentView === 'users-charts' ? (
            <AdminUsersCharts />
          ) : currentView === 'chat-history' ? (
            <AdminChatHistory />
          ) : currentView === 'algorithms' ? (
            <div className={styles.adminPanel}>
              <h1 className={styles.title}>Алгоритмы</h1>
              <p className={styles.subtitle}>
                Дополнительные сценарии для чат-агента. Выкл — поведение как раньше, без расширенного блока.
              </p>
              <div className={styles.section}>
                <label className={styles.algorithmCheckboxRow}>
                  <input
                    type="checkbox"
                    checked={personalityReadingAlgorithm}
                    disabled={algorithmsLoading || algorithmsSaving}
                    onChange={(e) => savePersonalityReadingAlgorithm(e.target.checked)}
                  />
                  <span>Алгоритм считывания личности человека</span>
                </label>
                <p className={styles.agentSectionsHint}>
                  Если включено: для подходящих запросов (о себе, личности, карте, начало диалога и т.п.) в системный
                  промпт добавляется отдельный блок с пошаговым алгоритмом и выборкой из областей памяти: книга по
                  знаку асцендента, «Интерпретация натальной карты», «Как трактовать карту — часть 1», «Сила и
                  поражение планет», «51 опора», «12 основ счастья…», планеты по сфере запроса, при необходимости —
                  сексуальный сценарий при подавленности; в начале диалога — «Пример расчета чаракарок». Названия
                  разделов в базе должны совпадать с заданными в коде, разделы — быть подключены к агенту.
                </p>
                {(algorithmsLoading || algorithmsSaving) && (
                  <p className={styles.hint}>{algorithmsSaving ? 'Сохранение…' : 'Загрузка…'}</p>
                )}
              </div>
              {error && currentView === 'algorithms' && <div className={styles.error}>{error}</div>}
            </div>
          ) : currentView === 'statistics' ? (
            <div className={styles.adminPanel}>
              <h1 className={styles.title}>Статистика</h1>
              <AdminPaymentsStats />
            </div>
          ) : currentView === 'mailings' ? (
            <div className={styles.adminPanel}>
              <AdminMailings />
            </div>
          ) : currentView === 'trial-end' ? (
            <div className={styles.adminPanel}>
              <AdminTrialEnd />
            </div>
          ) : currentView === 'partner' ? (
            <div className={styles.adminPanel}>
              <AdminPartner />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
