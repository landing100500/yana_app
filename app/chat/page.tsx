'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { SupportMenuIcon } from '@/components/SupportContactPopup';
import PlanTimerBadge from '@/components/chat/PlanTimerBadge';
import MessageParagraphs from '@/components/chat/MessageParagraphs';
import CircularProgressLoader from '@/components/ui/CircularProgressLoader';
import {
  loadChatPageBootstrap,
  readChatBootstrapCache,
  type ChatBootstrapResult,
} from '@/lib/chat-bootstrap';
import {
  clearSessionCaches,
  isSessionAuthenticated,
  markSessionAuthenticated,
} from '@/lib/client-page-cache';
import styles from './page.module.css';

const VoiceInputButton = dynamic(() => import('./VoiceInputButton'), { ssr: false });
const SupportContactPopup = dynamic(() => import('@/components/SupportContactPopup'), { ssr: false });
const ACTIVE_CHART_STORAGE_KEY = 'active_natal_chart_id';

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
  email: string | null;
  name?: string;
  plan?: {
    code: 'free' | 'hours24' | 'optimal' | 'professional';
    title: string;
    expiresAt: string | null;
    hasUnlimitedTime: boolean;
    remainingSeconds: number | null;
    chartComparison: boolean;
  };
}

interface ChatContext {
  name: string | null;
  hasMainNatalChart: boolean;
  selfKnowledgeQuestions: string[];
}

interface NatalChartOption {
  id: number;
  name: string;
  chartDate: string;
  chartTime: string;
  chartCity: string;
  isMain?: boolean;
  isFrozen?: boolean;
}

function getInitialChatCache(): ChatBootstrapResult | null {
  if (typeof window === 'undefined') return null;
  return readChatBootstrapCache();
}

export default function ChatPage() {
  const initialCache = getInitialChatCache();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [topics, setTopics] = useState<ChatTopic[]>(initialCache?.topics ?? []);
  const [currentTopicId, setCurrentTopicId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthChecked, setIsAuthChecked] = useState(() => isSessionAuthenticated());
  const [isPageReady, setIsPageReady] = useState(() => !!initialCache);
  const [loadProgress, setLoadProgress] = useState(() => (initialCache ? 100 : 5));
  const [userProfile, setUserProfile] = useState<UserProfile | null>(initialCache?.profile ?? null);
  const [chatContext, setChatContext] = useState<ChatContext | null>(initialCache?.chatContext ?? null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [natalChartModal, setNatalChartModal] = useState<{ show: boolean; progress: number; phase: 'progress' | 'done' }>({ show: false, progress: 0, phase: 'progress' });
  const [questionsVisibleCount, setQuestionsVisibleCount] = useState(6);
  const [rotatingQuestionIndex, setRotatingQuestionIndex] = useState(0);
  const [inputFocused, setInputFocused] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<{ chartAId: number; chartAName: string; chartBId: number; chartBName: string } | null>(null);
  const [natalCharts, setNatalCharts] = useState<NatalChartOption[]>(initialCache?.charts ?? []);
  const [selectedChartId, setSelectedChartId] = useState<number | null>(initialCache?.selectedChartId ?? null);
  const [isChartBadgeCollapsed, setIsChartBadgeCollapsed] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectedChartIdRef = useRef<number | null>(null);
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
              
              markSessionAuthenticated();
              setLoadProgress(18);
              setIsAuthChecked(true);
              return;
            }
          } catch (e) {
            console.error('Failed to set backup token:', e);
          }
        }
        clearSessionCaches();
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
      
      markSessionAuthenticated();
      setLoadProgress(18);
      setIsAuthChecked(true);
    } catch (err) {
      console.error('Auth check error:', err);
      clearSessionCaches();
      router.push('/');
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const applyBootstrap = useCallback((data: ChatBootstrapResult) => {
    setUserProfile(data.profile);
    setChatContext(data.chatContext);
    setTopics(data.topics);
    setNatalCharts(data.charts);
    setSelectedChartId(data.selectedChartId);
  }, []);

  useEffect(() => {
    if (!isAuthChecked) return;

    let cancelled = false;
    const cached = readChatBootstrapCache();
    const hadCache = !!cached;

    if (cached) {
      applyBootstrap(cached);
      setLoadProgress(100);
      setIsPageReady(true);
    } else {
      setIsPageReady(false);
      setLoadProgress(20);
    }

    (async () => {
      try {
        const data = await loadChatPageBootstrap(
          selectedChartIdRef.current,
          hadCache
            ? undefined
            : (p) => {
                if (!cancelled) setLoadProgress(20 + Math.round(p * 0.8));
              }
        );
        if (cancelled) return;
        applyBootstrap(data);
      } catch (err) {
        console.error('Chat bootstrap error', err);
      } finally {
        if (!cancelled) {
          setLoadProgress(100);
          setIsPageReady(true);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isAuthChecked, applyBootstrap]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('chart_comparison_mode');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed?.chartAId && parsed?.chartBId && parsed?.chartAName && parsed?.chartBName) {
        setComparisonMode({
          chartAId: Number(parsed.chartAId),
          chartAName: String(parsed.chartAName),
          chartBId: Number(parsed.chartBId),
          chartBName: String(parsed.chartBName),
        });
      }
    } catch {
      // ignore
    }
  }, []);

  const refreshChatContext = async () => {
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

  const refreshAvailableCharts = async () => {
    try {
      const res = await fetch('/api/natal-chart/calculate', { credentials: 'include' });
      if (!res.ok) return;
      const data = await res.json();
      const allCharts: NatalChartOption[] = Array.isArray(data.charts) ? data.charts : [];
      const availableCharts = allCharts.filter((chart) => !chart.isFrozen);
      setNatalCharts(availableCharts);
      if (availableCharts.length === 0) {
        setSelectedChartId(null);
        return;
      }
      const storedRaw = localStorage.getItem(ACTIVE_CHART_STORAGE_KEY);
      const storedId = storedRaw ? Number(storedRaw) : null;
      const currentStillExists = selectedChartId && availableCharts.some((chart) => chart.id === selectedChartId);
      if (currentStillExists) return;
      if (storedId && availableCharts.some((chart) => chart.id === storedId)) {
        setSelectedChartId(storedId);
        return;
      }
      const mainChart = availableCharts.find((chart) => chart.isMain);
      setSelectedChartId(mainChart?.id ?? availableCharts[0].id);
    } catch (err) {
      console.error('Failed to load available charts', err);
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
  }, [isAuthChecked, chatContext]);

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

  useEffect(() => {
    if (!isSupportOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsSupportOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isSupportOpen]);

  const refreshUserProfile = async () => {
    try {
      let response = await fetch('/api/auth/profile', { credentials: 'include' });
      if (response.status === 401) {
        const backupToken = localStorage.getItem('auth_token_backup');
        if (backupToken) {
          const restoreResponse = await fetch('/api/auth/set-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: backupToken }),
            credentials: 'include',
          });
          if (restoreResponse.ok) {
            response = await fetch('/api/auth/profile', { credentials: 'include' });
          }
        }
      }
      if (response.ok) {
        setUserProfile(await response.json());
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
      clearSessionCaches();
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
      localStorage.removeItem('auth_token_backup');
      clearSessionCaches();
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
      const fallbackComparison = (() => {
        try {
          const raw = localStorage.getItem('chart_comparison_mode');
          if (!raw) return null;
          const parsed = JSON.parse(raw);
          if (parsed?.chartAId && parsed?.chartBId && parsed?.chartAName && parsed?.chartBName) return parsed;
        } catch {
          return null;
        }
        return null;
      })();
      const activeComparison = comparisonMode ?? fallbackComparison;
      const response = await fetch('/api/chat/message', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          topicId: currentTopicId,
          comparisonMode: activeComparison,
          selectedChartId: activeComparison ? undefined : selectedChartIdRef.current,
        }),
      });

      let data: { response?: string; topicId?: number; error?: string; detail?: string } | null = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(`HTTP ${response.status}: ответ не JSON (часто nginx timeout или падение процесса)`);
      }

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
        refreshUserProfile();
      } else {
        const errorText =
          data?.detail || data?.error || `Ошибка сервера (HTTP ${response.status})`;
        const errorMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: errorText,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, errorMessage]);
      }
    } catch (err) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content:
          err instanceof Error ? err.message : 'Произошла ошибка при отправке сообщения',
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
        body: JSON.stringify({
          questionNumber: questionIndex + 1,
          selectedChartId: selectedChartIdRef.current,
        }),
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

  useEffect(() => {
    if (selectedChartId) {
      localStorage.setItem(ACTIVE_CHART_STORAGE_KEY, String(selectedChartId));
    }
    selectedChartIdRef.current = selectedChartId;
  }, [selectedChartId]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const maxHeight = 176;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  }, [input]);

  useEffect(() => {
    if (selectedChartId) {
      setIsChartBadgeCollapsed(false);
    }
  }, [selectedChartId]);

  const showLoader = !isAuthChecked || !isPageReady;
  if (showLoader) {
    return <CircularProgressLoader progress={loadProgress} />;
  }

  return (
    <div className={styles.container}>
      {userProfile?.plan && <PlanTimerBadge plan={userProfile.plan} />}
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
                    refreshChatContext();
                    refreshAvailableCharts();
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
                      {userProfile?.email ?? '—'}
                    </div>
                    {userProfile?.plan && (
                      <>
                        <button
                          className={styles.planLink}
                          onClick={() => {
                            router.push('/tariffs');
                            setIsMenuOpen(false);
                          }}
                        >
                          Тариф: {userProfile.plan.title}
                        </button>
                        <button
                          className={styles.planChooseLink}
                          onClick={() => {
                            router.push('/tariffs');
                            setIsMenuOpen(false);
                          }}
                        >
                          Выбрать тариф
                        </button>
                      </>
                    )}
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
                  {userProfile?.plan?.chartComparison && (
                    <button
                      className={styles.menuItem}
                      onClick={() => {
                        router.push('/chart-comparison');
                        setIsMenuOpen(false);
                      }}
                    >
                      Сравнение карт
                    </button>
                  )}
                  <button
                    type="button"
                    className={`${styles.menuItem} ${styles.menuItemWithIcon}`}
                    onClick={() => {
                      setIsMenuOpen(false);
                      setIsSupportOpen(true);
                    }}
                  >
                    <SupportMenuIcon />
                    <span>Поддержка</span>
                  </button>
                  <button
                    type="button"
                    className={`${styles.menuItem} ${styles.menuItemWithIcon}`}
                    onClick={() => {
                      setIsMenuOpen(false);
                      router.push('/install');
                    }}
                  >
                    <svg
                      className={styles.menuItemIconSvg}
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                      aria-hidden
                    >
                      <rect
                        x="6"
                        y="2"
                        width="12"
                        height="20"
                        rx="2"
                        stroke="currentColor"
                        strokeWidth="1.75"
                      />
                      <path
                        d="M10 19h4"
                        stroke="currentColor"
                        strokeWidth="1.75"
                        strokeLinecap="round"
                      />
                      <path
                        d="M12 6v6m0 0l-2-2m2 2l2-2"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    <span>Установить на устройство</span>
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
          {userProfile?.plan && <PlanTimerBadge plan={userProfile.plan} className="mobile" />}
        </header>
        {!comparisonMode && !isChartBadgeCollapsed && (
          <div className={styles.activeChartFloatingBadge}>
            <span className={styles.activeChartLabel}>ЯСНА отвечает по карте:</span>
            <select
              className={styles.activeChartSelect}
              value={selectedChartId ?? ''}
              onChange={(e) => {
                const nextChartId = e.target.value ? Number(e.target.value) : null;
                selectedChartIdRef.current = nextChartId;
                setSelectedChartId(nextChartId);
              }}
            >
              {natalCharts.map((chart) => (
                <option key={chart.id} value={chart.id}>
                  {chart.name} ({chart.chartDate} {chart.chartTime}, {chart.chartCity})
                </option>
              ))}
            </select>
            <button
              type="button"
              className={styles.activeChartClose}
              onClick={() => setIsChartBadgeCollapsed(true)}
              aria-label="Свернуть выбор карты"
            >
              ×
            </button>
          </div>
        )}
        {!comparisonMode && isChartBadgeCollapsed && (
          <button
            type="button"
            className={styles.activeChartCollapsedButton}
            onClick={() => setIsChartBadgeCollapsed(false)}
            aria-label="Развернуть выбор карты"
            title="Показать выбор карты"
          >
            !
          </button>
        )}
        <div className={styles.messages}>
          {comparisonMode && (
            <div className={styles.comparisonBanner}>
              Режим сравнения: {comparisonMode.chartAName} vs {comparisonMode.chartBName}
              <button
                className={styles.comparisonExitButton}
                type="button"
                onClick={() => {
                  localStorage.removeItem('chart_comparison_mode');
                  setComparisonMode(null);
                }}
              >
                Выйти из режима
              </button>
            </div>
          )}
          {messages.length === 0 && !comparisonMode ? (
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
                  <MessageParagraphs
                    content={message.content}
                    onTariffsClick={() => router.push('/tariffs')}
                  />
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

        {messages.length === 0 && !comparisonMode && questions.length > 0 && questions[rotatingQuestionIndex] && (
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
          <div className={styles.inputRow}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Задайте вопрос..."
              className={styles.input}
              disabled={isLoading}
              rows={1}
            />
            <VoiceInputButton
              setInput={setInput}
              disabled={isLoading}
              hidden={inputFocused}
            />
          </div>
          <button
            type="submit"
            className={styles.sendButton}
            disabled={isLoading || !input.trim()}
            aria-label="Отправить"
          >
            <span className={styles.sendButtonText}>Отправить</span>
            <span className={styles.sendButtonIcon} aria-hidden>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22 2L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </span>
          </button>
        </form>
      </main>

      {isSupportOpen && <SupportContactPopup onClose={() => setIsSupportOpen(false)} />}
    </div>
  );
}

