declare module 'react-speech-recognition' {
  export interface SpeechRecognitionOptions {
    continuous?: boolean;
    language?: string;
    interimResults?: boolean;
  }

  export interface UseSpeechRecognitionReturn {
    transcript: string;
    interimTranscript: string;
    finalTranscript: string;
    listening: boolean;
    resetTranscript: () => void;
    startListening: (options?: SpeechRecognitionOptions) => Promise<void>;
    stopListening: () => Promise<void>;
    browserSupportsSpeechRecognition: boolean;
    browserSupportsContinuousListening?: boolean;
    isMicrophoneAvailable?: boolean;
  }

  export function useSpeechRecognition(): UseSpeechRecognitionReturn;

  export interface SpeechRecognitionStatic {
    startListening: (options?: SpeechRecognitionOptions) => Promise<void>;
    stopListening: () => Promise<void>;
    abortListening: () => Promise<void>;
    applyPolyfill: (polyfill: unknown) => void;
  }

  const SpeechRecognition: SpeechRecognitionStatic;
  export default SpeechRecognition;
}
