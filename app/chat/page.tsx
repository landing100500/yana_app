'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.css';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatTopic {
  id: number;
  title: string;
  createdAt: string;
}

interface UserProfile {
  phone: string;
  name?: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [topics, setTopics] = useState<ChatTopic[]>([]);
  const [currentTopicId, setCurrentTopicId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthChecked) {
      loadTopics();
      loadUserProfile();
    }
  }, [isAuthChecked]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
      }
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };

    if (isMenuOpen || isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen, isMobileMenuOpen]);

  const checkAuth = async () => {
    try {
      const response = await fetch('/api/auth/check', {
        credentials: 'include',
      });
      const data = await response.json();
      
      if (!response.ok || !data.authenticated) {
        // Проверяем резервный токен из localStorage
        const backupToken = localStorage.getItem('auth_token_backup');
        if (backupToken) {
          // Пытаемся установить cookie через API
          try {
            await fetch('/api/auth/set-token', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: backupToken }),
              credentials: 'include',
            });
            // Повторная проверка
            const retryResponse = await fetch('/api/auth/check', {
              credentials: 'include',
            });
            const retryData = await retryResponse.json();
            if (retryData.authenticated) {
              setIsAuthChecked(true);
              return;
            }
          } catch (e) {
            console.error('Failed to set backup token:', e);
          }
        }
        router.push('/');
        return;
      }
      
      setIsAuthChecked(true);
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/');
    }
  };

  const loadUserProfile = async () => {
    try {
      const response = await fetch('/api/auth/profile');
      if (response.ok) {
        const data = await response.json();
        setUserProfile(data);
      }
    } catch (err) {
      console.error('Failed to load user profile');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
      localStorage.removeItem('auth_token_backup');
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
      localStorage.removeItem('auth_token_backup');
      router.push('/');
    }
  };

  const loadTopics = async () => {
    try {
      const response = await fetch('/api/chat/topics');
      if (response.ok) {
        const data = await response.json();
        setTopics(data.topics || []);
      }
    } catch (err) {
      console.error('Failed to load topics');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          topicId: currentTopicId,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.response || 'Извините, произошла ошибка',
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        if (data.topicId && !currentTopicId) {
          setCurrentTopicId(data.topicId);
          loadTopics();
        }
      } else {
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Произошла ошибка при отправке сообщения',
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Произошла ошибка при отправке сообщения',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleNewTopic = () => {
    setMessages([]);
    setCurrentTopicId(null);
  };

  const handleTopicSelect = async (topicId: number) => {
    setCurrentTopicId(topicId);
    setIsMobileMenuOpen(false); // Закрываем мобильное меню при выборе темы
    try {
      const response = await fetch(`/api/chat/topics/${topicId}/messages`);
      if (response.ok) {
        const data = await response.json();
        setMessages(data.messages || []);
      }
    } catch (err) {
      console.error('Failed to load topic messages');
    }
  };

  if (!isAuthChecked) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loader}>
          <div className={styles.loaderCircle}></div>
          <div className={styles.loaderCircle}></div>
          <div className={styles.loaderCircle}></div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <aside 
        className={`${styles.sidebar} ${isMobileMenuOpen ? styles.sidebarOpen : ''}`}
        ref={mobileMenuRef}
      >
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Темы</h2>
          <button 
            className={styles.closeButton}
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Закрыть меню"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <button className={styles.newChatButton} onClick={() => { handleNewTopic(); setIsMobileMenuOpen(false); }}>
          + Новый чат
        </button>
        <div className={styles.topicsList}>
          {topics.map((topic) => (
            <button
              key={topic.id}
              className={`${styles.topicItem} ${currentTopicId === topic.id ? styles.active : ''}`}
              onClick={() => handleTopicSelect(topic.id)}
            >
              <span className={styles.topicTitle}>{topic.title}</span>
            </button>
          ))}
        </div>
      </aside>

      {isMobileMenuOpen && <div className={styles.overlay} onClick={() => setIsMobileMenuOpen(false)} />}

      <main className={styles.chatContainer}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <button 
              className={styles.burgerButton}
              onClick={() => setIsMobileMenuOpen(true)}
              aria-label="Открыть меню"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M3 12H21M3 6H21M3 18H21" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
            <h1 className={styles.headerTitle}>ЯСНА</h1>
            <div className={styles.profileMenu} ref={menuRef}>
              <button
                className={styles.profileButton}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                aria-label="Профиль"
              >
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M20.59 22C20.59 18.13 16.74 15 12 15C7.26 15 3.41 18.13 3.41 22"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              {isMenuOpen && (
                <div className={styles.profileDropdown}>
                  <div className={styles.profileInfo}>
                    <div className={styles.profilePhone}>
                      {userProfile?.phone || 'Загрузка...'}
                    </div>
                    {userProfile?.name && (
                      <div className={styles.profileName}>{userProfile.name}</div>
                    )}
                  </div>
                  <button
                    className={styles.logoutButton}
                    onClick={handleLogout}
                  >
                    Выйти
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <div className={styles.messages}>
          {messages.length === 0 ? (
            <div className={styles.welcome}>
              <h1 className={styles.welcomeTitle}>ЯСНА</h1>
              <p className={styles.welcomeText}>
                Задайте вопрос о натальной карте, астрологии или эзотерике
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${styles[message.role]}`}
              >
                <div className={styles.messageContent}>{message.content}</div>
              </div>
            ))
          )}
          {isLoading && (
            <div className={`${styles.message} ${styles.assistant}`}>
              <div className={styles.loading}>
                <div className={styles.loader}>
                  <div className={styles.loaderCircle}></div>
                  <div className={styles.loaderCircle}></div>
                  <div className={styles.loaderCircle}></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <form onSubmit={handleSend} className={styles.inputForm}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Задайте вопрос..."
            className={styles.input}
            disabled={isLoading}
          />
          <button
            type="submit"
            className={styles.sendButton}
            disabled={isLoading || !input.trim()}
          >
            Отправить
          </button>
        </form>
      </main>
    </div>
  );
}

