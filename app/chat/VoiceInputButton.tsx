'use client';

import { useEffect, useRef } from 'react';
import SpeechRecognition, { useSpeechRecognition } from 'react-speech-recognition';
import styles from './page.module.css';

type Props = {
  setInput: (fn: (prev: string) => string) => void;
  disabled?: boolean;
  hidden?: boolean;
};

export default function VoiceInputButton({ setInput, disabled, hidden }: Props) {
  const {
    transcript,
    listening,
    resetTranscript,
    browserSupportsSpeechRecognition,
  } = useSpeechRecognition();

  const prevListening = useRef(false);

  useEffect(() => {
    if (prevListening.current && !listening && transcript.trim()) {
      setInput((prev) => (prev ? prev + ' ' + transcript.trim() : transcript.trim()));
      resetTranscript();
    }
    prevListening.current = listening;
  }, [listening, transcript, setInput, resetTranscript]);

  if (!browserSupportsSpeechRecognition) {
    return null;
  }

  const handleClick = () => {
    if (listening) {
      SpeechRecognition.stopListening();
    } else {
      SpeechRecognition.startListening({
        continuous: true,
        language: 'ru-RU',
      });
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
