'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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

interface ChatContext {
  name: string | null;
  hasMainNatalChart: boolean;
  selfKnowledgeQuestions: string[];
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [topics, setTopics] = useState<ChatTopic[]>([]);
  const [currentTopicId, setCurrentTopicId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [natalChartModal, setNatalChartModal] = useState<{ show: boolean; progress: number; phase: 'progress' | 'done' }>({ show: false, progress: 0, phase: 'progress' });
  const [questionsVisibleCount, setQuestionsVisibleCount] = useState(6);
  const [rotatingQuestionIndex, setRotatingQuestionIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const QUESTIONS_BATCH = 6;
  const questions = chatContext?.selfKnowledgeQuestions ?? [];
  const visibleQuestions = questions.slice(0, questionsVisibleCount);
  const hasMoreQuestions = questionsVisibleCount < questions.length;

  const checkAuth = useCallback(async () => {
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
              // Проверяем анкету после успешной авторизации
              const anketaResponse = await fetch('/api/anketa/check', {
                credentials: 'include',
              });
              const anketaData = await anketaResponse.json();
              
              if (!anketaResponse.ok || !anketaData.filled) {
                router.push('/anketa');
                return;
              }
              
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
      
      // Проверяем анкету после успешной авторизации
      const anketaResponse = await fetch('/api/anketa/check', {
        credentials: 'include',
      });
      const anketaData = await anketaResponse.json();
      
      if (!anketaResponse.ok || !anketaData.filled) {
        // Анкета не заполнена - редирект на страницу опроса
        router.push('/anketa');
        return;
      }
      
      setIsAuthChecked(true);
    } catch (err) {
      console.error('Auth check error:', err);
      router.push('/');
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (isAuthChecked) {
      loadTopics();
      loadUserProfile();
      loadChatContext();
    }
  }, [isAuthChecked]);

  const loadChatContext = async () => {
    try {
      const res = await fetch('/api/chat/context', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setChatContext({
          name: data.name ?? null,
          hasMainNatalChart: !!data.hasMainNatalChart,
          selfKnowledgeQuestions: Array.isArray(data.selfKnowledgeQuestions) ? data.selfKnowledgeQuestions : [],
        });
      }
    } catch (err) {
      console.error('Failed to load chat context', err);
    }
  };

  // При первом заходе в чат: создаём основную натальную карту, если её нет; показываем попап с прогрессом
  useEffect(() => {
    if (!isAuthChecked || chatContext === null) return;
    if (chatContext.hasMainNatalChart) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/natal-chart/ensure-main', { method: 'POST', credentials: 'include' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) return;
        if (data.created) {
          setNatalChartModal({ show: true, progress: 0, phase: 'progress' });
          const durationMs = 10000;
          const steps = 50;
          const stepMs = durationMs / steps;
          for (let i = 1; i <= steps; i++) {
            if (cancelled) return;
            await new Promise((r) => setTimeout(r, stepMs));
            if (cancelled) return;
            setNatalChartModal((m) => ({ ...m, progress: (i / steps) * 100 }));
          }
          if (cancelled) return;
          setNatalChartModal((m) => ({ ...m, phase: 'done' }));
        }
      } catch (err) {
        console.error('Ensure main natal chart error', err);
      }
    })();
    return () => { cancelled = true; };
  }, [isAuthChecked, chatContext?.hasMainNatalChart]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Поочерёдный показ вопросов у поля ввода (как у ChatGPT)
  useEffect(() => {
    if (messages.length > 0 || questions.length === 0) return;
    const id = setInterval(() => {
      setRotatingQuestionIndex((i) => (i + 1) % questions.length);
    }, 3500);
    return () => clearInterval(id);
  }, [messages.length, questions.length]);

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

        // Обновляем currentTopicId если он был создан или изменен
        if (data.topicId) {
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
    setQuestionsVisibleCount(6);
  };

  const handleTopicSelect = async (topicId: number) => {
    setCurrentTopicId(topicId);
    setIsMobileMenuOpen(false); // Закрываем мобильное меню при выборе темы
    setIsLoading(true);
    try {
      const response = await fetch(`/api/chat/topics/${topicId}/messages`);
      if (response.ok) {
        const data = await response.json();
        const loadedMessages: Message[] = (data.messages || []).map((msg: any) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          timestamp: new Date(msg.timestamp),
        }));
        setMessages(loadedMessages);
      } else {
        setMessages([]);
      }
    } catch (err) {
      console.error('Failed to load topic messages:', err);
      setMessages([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelfKnowledgeQuestion = async (questionIndex: number, questionText: string) => {
    setIsLoading(true);
    try {
      let newTopicId: number | null = currentTopicId;
      if (!newTopicId) {
        const topicRes = await fetch('/api/chat/topics', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: questionText.length > 50 ? questionText.slice(0, 50) + '...' : questionText }),
        });
        if (topicRes.ok) {
          const topicData = await topicRes.json();
          newTopicId = topicData.topic?.id || null;
          if (newTopicId) {
            setCurrentTopicId(newTopicId);
            loadTopics();
          }
        }
      }

      const userMessage: Message = {
        id: Date.now().toString(),
        role: 'user',
        content: questionText,
        timestamp: new Date(),
      };
      setMessages((prev) => (newTopicId && prev.length === 0 ? [userMessage] : [...prev, userMessage]));

      const assistantMessageId = (Date.now() + 1).toString();
      setMessages((prev) => [...prev, { id: assistantMessageId, role: 'assistant' as const, content: '', timestamp: new Date() }]);

      const response = await fetch('/api/self-knowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questionNumber: questionIndex + 1 }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Ошибка при получении ответа');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullResponse += chunk;
          setMessages((prev) =>
            prev.map((msg) => (msg.id === assistantMessageId ? { ...msg, content: fullResponse } : msg))
          );
        }
      }

      if (newTopicId && fullResponse) {
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            topicId: newTopicId,
            userMessage: questionText,
            assistantMessage: fullResponse,
          }),
        }).catch((e) => console.error('Error saving message:', e));
      }
    } catch (err: any) {
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: err.message || 'Произошла ошибка. Попробуйте позже.',
        timestamp: new Date(),
      };
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && last.content === '') return [...prev.slice(0, -1), errorMessage];
        return [...prev, errorMessage];
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteTopic = async (topicId: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем выбор топика при клике на удаление
    
    if (!confirm('Вы уверены, что хотите удалить этот чат? Все сообщения будут удалены.')) {
      return;
    }

    try {
      const response = await fetch(`/api/chat/topics/${topicId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        // Если удаляемый топик был текущим, очищаем сообщения
        if (currentTopicId === topicId) {
          setMessages([]);
          setCurrentTopicId(null);
        }
        // Обновляем список топиков
        loadTopics();
      } else {
        alert('Ошибка при удалении чата');
      }
    } catch (err) {
      console.error('Failed to delete topic:', err);
      alert('Ошибка при удалении чата');
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
      {natalChartModal.show && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            {natalChartModal.phase === 'progress' ? (
              <>
                <p className={styles.modalTitle}>Создание натальной карты</p>
                <div className={styles.modalProgressBar}>
                  <div className={styles.modalProgressFill} style={{ width: `${natalChartModal.progress}%` }} />
                </div>
              </>
            ) : (
              <>
                <p className={styles.modalTitle}>Ваша основная натальная карта рассчитана</p>
                <button
                  type="button"
                  className={styles.modalCloseButton}
                  onClick={() => {
                    setNatalChartModal((m) => ({ ...m, show: false }));
                    loadChatContext();
                  }}
                >
                  Продолжить
                </button>
              </>
            )}
          </div>
        </div>
      )}
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
            <div
              key={topic.id}
              className={`${styles.topicItemWrapper} ${currentTopicId === topic.id ? styles.active : ''}`}
            >
              <button
                className={styles.topicItem}
                onClick={() => handleTopicSelect(topic.id)}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setTooltip({
                    text: topic.title,
                    x: rect.left + rect.width / 2,
                    y: rect.top,
                  });
                }}
                onMouseLeave={() => setTooltip(null)}
              >
                <span className={styles.topicTitle}>{topic.title}</span>
              </button>
              <button
                className={styles.deleteTopicButton}
                onClick={(e) => handleDeleteTopic(topic.id, e)}
                aria-label="Удалить чат"
                title="Удалить чат"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M3 6H5H21M8 6V4C8 3.46957 8.21071 2.96086 8.58579 2.58579C8.96086 2.21071 9.46957 2 10 2H14C14.5304 2 15.0391 2.21071 15.4142 2.58579C15.7893 2.96086 16 3.46957 16 4V6M19 6V20C19 20.5304 18.7893 21.0391 18.4142 21.4142C18.0391 21.7893 17.5304 22 17 22H7C6.46957 22 5.96086 21.7893 5.58579 21.4142C5.21071 21.0391 5 20.5304 5 20V6H19Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            </div>
          ))}
        </div>
        {tooltip && (
          <div
            className={styles.tooltip}
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
            }}
          >
            {tooltip.text}
          </div>
        )}
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
            <Image
              src="/logo/logo_big.png"
              alt="ЯСНА"
              width={120}
              height={48}
              className={styles.headerLogo}
              priority
            />
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
                    className={styles.menuItem}
                    onClick={() => {
                      router.push('/natal-chart');
                      setIsMenuOpen(false);
                    }}
                  >
                    Мои карты
                  </button>
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
              <Image
                src="/logo/logo_big.png"
                alt="ЯСНА"
                width={240}
                height={96}
                className={styles.welcomeLogo}
                priority
              />
              <p className={styles.welcomeGreeting}>
                {chatContext?.name ? `Привет, ${chatContext.name}!` : 'Привет!'}
              </p>
              <p className={styles.welcomeText}>
                Что вас сейчас интересует?
              </p>
              <div className={styles.questionsCloud}>
                {visibleQuestions.map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={styles.questionChip}
                    style={{ animationDelay: `${idx * 0.1}s` }}
                    onClick={() => handleSelfKnowledgeQuestion(idx, q)}
                    disabled={isLoading}
                  >
                    {q}
                  </button>
                ))}
                {hasMoreQuestions && (
                  <button
                    type="button"
                    className={styles.questionChipMore}
                    style={{ animationDelay: `${visibleQuestions.length * 0.1}s` }}
                    onClick={() => setQuestionsVisibleCount((c) => Math.min(c + QUESTIONS_BATCH, questions.length))}
                    disabled={isLoading}
                  >
                    Ещё
                  </button>
                )}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id}
                className={`${styles.message} ${styles[message.role]}`}
              >
                <div className={styles.messageContent}>
                  {message.content.split(/\n\n+/).map((paragraph, idx) => {
                    const trimmed = paragraph.trim();
                    if (!trimmed) return null;
                    
                    // Проверяем, является ли параграф вопросом (начинается с **число.)
                    const isQuestion = /^\*\*\d+\./.test(trimmed);
                    if (isQuestion) {
                      // Форматируем вопрос - только текст внутри ** становится жирным
                      const formatted = trimmed
                        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                        .replace(/\n/g, '<br>');
                      return (
                        <div key={idx}>
                          <p className={styles.questionParagraph} dangerouslySetInnerHTML={{ __html: formatted }} />
                        </div>
                      );
                    } else {
                      // Обычный параграф (ответ) - обычный текст, без жирного
                      return (
                        <div key={idx}>
                          <p className={styles.answerParagraph} dangerouslySetInnerHTML={{ __html: trimmed.replace(/\n/g, '<br>') }} />
                        </div>
                      );
                    }
                  })}
                </div>
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

        {messages.length === 0 && questions.length > 0 && questions[rotatingQuestionIndex] && (
          <button
            type="button"
            className={styles.inputSuggestionChip}
            onClick={() => handleSelfKnowledgeQuestion(rotatingQuestionIndex, questions[rotatingQuestionIndex])}
            disabled={isLoading}
          >
            {questions[rotatingQuestionIndex]}
          </button>
        )}
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

