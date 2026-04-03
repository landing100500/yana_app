'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './page.module.css';

type Props = {
  setInput: (fn: (prev: string) => string) => void;
  disabled?: boolean;
  hidden?: boolean;
};

type SpeechRecognitionResult = {
  isFinal?: boolean;
  [index: number]: { transcript?: string } | undefined;
};

type SpeechRecognitionResultList = {
  length: number;
  [index: number]: SpeechRecognitionResult | undefined;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionInstance = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort?: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

export default function VoiceInputButton({ setInput, disabled, hidden }: Props) {
  const speechRecognitionCtor = useMemo(() => {
    // Web Speech API exists only in the browser.
    if (typeof window === 'undefined') return null;
    const w = window as unknown as {
      SpeechRecognition?: SpeechRecognitionCtor;
      webkitSpeechRecognition?: SpeechRecognitionCtor;
    };
    return w.SpeechRecognition || w.webkitSpeechRecognition || null;
  }, []);

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const [listening, setListening] = useState(false);
  const [micLevel, setMicLevel] = useState(0);
  const finalTranscriptRef = useRef('');
  const interimTranscriptRef = useRef('');
  const lastActivityAtRef = useRef<number>(0);

  useEffect(() => {
    if (!speechRecognitionCtor) return;

    const recognition = new speechRecognitionCtor();
    recognitionRef.current = recognition;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'ru-RU';

    recognition.onresult = (event: SpeechRecognitionEventLike) => {
      // event.results is a SpeechRecognitionResultList; some browsers can send
      // results with empty alternatives, so we must guard everything.
      const results = event.results;
      let interim = '';
      let final = '';

      for (let i = event.resultIndex; i < results.length; i++) {
        const res = results[i];
        const alt = res?.[0];
        const text = alt?.transcript;
        if (!text) continue;
        if (res?.isFinal) final += text;
        else interim += text;
      }

      if (final) {
        finalTranscriptRef.current = (finalTranscriptRef.current + ' ' + final).trim();
        interimTranscriptRef.current = '';
      } else if (interim) {
        interimTranscriptRef.current = interim;
      }

      // Drive UI "voice activity" from interim/final emission.
      // It's not actual microphone amplitude, but it reliably shows motion when the browser is listening.
      const emitted = final || interim;
      const emittedLen = emitted.trim().length;
      if (emittedLen > 0) {
        // Raise sensitivity: even short phrases should visibly "kick" the waveform.
        const normalized = Math.min(1, Math.pow(emittedLen / 10, 0.65));
        // Keep it non-zero, then scale up to make motion more obvious.
        setMicLevel(0.35 + 0.65 * normalized);
        lastActivityAtRef.current = Date.now();
      }
    };

    recognition.onerror = () => {
      // Stop updating state on error; onend will normalize the "stop" flow.
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
      setMicLevel(0);
      // Some browsers may only emit interim results; fallback to improve UX.
      const text = (finalTranscriptRef.current || interimTranscriptRef.current).trim();
      if (text) {
        setInput((prev) => (prev ? prev + ' ' + text : text));
      }
      finalTranscriptRef.current = '';
      interimTranscriptRef.current = '';
    };

    return () => {
      // Ensure mic is released if the component unmounts.
      try {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
        recognitionRef.current = null;
      } catch {
        // Best-effort cleanup; different browsers throw differently on stop/unmount.
      }
    };
  }, [speechRecognitionCtor, setInput]);

  useEffect(() => {
    if (!listening) return;

    const t = window.setInterval(() => {
      const idleMs = Date.now() - lastActivityAtRef.current;
      if (idleMs > 450) {
        setMicLevel(0);
        return;
      }
      // Slower decay = longer visible waveform after speech.
      setMicLevel((prev) => Math.max(0, prev * 0.9));
    }, 90);

    return () => window.clearInterval(t);
  }, [listening]);

  if (!speechRecognitionCtor) return null;

  const handleClick = () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (listening) {
      // onend will commit finalTranscriptRef if there is anything.
      try {
        recognition.stop();
      } catch {
        // Ignore stop race conditions.
      }
      return;
    }

    // Clear buffers for a fresh recording session.
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    lastActivityAtRef.current = 0;
    setMicLevel(0);

    recognition.lang = 'ru-RU';
    recognition.continuous = true;
    recognition.interimResults = true;

    setListening(true);
    try {
      recognition.start();
    } catch {
      // If browser throws "already started" or redundant starts, revert UI state.
      setListening(false);
    }
  };

  return (
    <button
      type="button"
      className={`${styles.micButton} ${listening ? styles.micButtonActive : ''} ${hidden ? styles.micButtonHidden : ''}`}
      onClick={handleClick}
      disabled={disabled}
      aria-label={listening ? 'Остановить запись' : 'Голосовой ввод'}
      title={listening ? 'Остановить запись' : 'Голосовой ввод'}
    >
      <div className={styles.micActivity} aria-hidden="true">
        <div className={styles.micRadar} />
        <div
          className={styles.micHalo}
          style={{
            opacity: 0.25 + micLevel * 0.75,
            transform: `translate(-50%, -50%) scale(${0.85 + micLevel * 0.35})`,
          }}
        />
        <div
          className={styles.micCore}
          style={{
            opacity: 0.15 + micLevel * 0.85,
            transform: `translate(-50%, -50%) scale(${0.85 + micLevel * 0.25})`,
          }}
        />
      </div>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={styles.micIcon}
        aria-hidden
      >
        <path
          d="M12 14C13.66 14 15 12.66 15 11V5C15 3.34 13.66 2 12 2C10.34 2 9 3.34 9 5V11C9 12.66 10.34 14 12 14Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M19 10V11C19 14.53 16.39 17.44 13 17.93V21H11V17.93C7.61 17.44 5 14.53 5 11V10"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
}
