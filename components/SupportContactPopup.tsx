'use client';

import BrandIcon from '@/components/ui/BrandIcon';
import styles from './SupportContactPopup.module.css';

const TELEGRAM_URL = 'https://t.me/yanavaganova';
const TELEGRAM_HANDLE = '@yanavaganova';
const MAX_PHONE = '+79252910310';
/** Открытие чата в MAX по номеру (как t.me для Telegram) */
const MAX_URL = `https://max.ru/chat?phone=${encodeURIComponent(MAX_PHONE)}`;

const TELEGRAM_ICON_URL = '/icons/telegram.svg';
const MAX_ICON_URL = '/icons/max-messenger.png';

interface Props {
  onClose: () => void;
}

export default function SupportContactPopup({ onClose }: Props) {
  return (
    <div className={styles.overlay} onClick={onClose} role="presentation">
      <div
        className={styles.popup}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="support-title"
        aria-modal="true"
      >
        <div className={styles.header}>
          <h3 id="support-title" className={styles.title}>
            Поддержка
          </h3>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Закрыть">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className={styles.links}>
          <a
            href={TELEGRAM_URL}
            className={styles.linkRow}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrandIcon src={TELEGRAM_ICON_URL} />
            <span className={styles.linkText}>{TELEGRAM_HANDLE}</span>
          </a>
          <a
            href={MAX_URL}
            className={styles.linkRow}
            target="_blank"
            rel="noopener noreferrer"
          >
            <BrandIcon src={MAX_ICON_URL} rounded />
            <span className={styles.linkText}>{MAX_PHONE}</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export function SupportMenuIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
      className={styles.menuIcon}
    >
      <path
        d="M4 11v4a3 3 0 0 0 3 3h1v-6H4zm16 0v4a3 3 0 0 1-3 3h-1v-6h1z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M7 11V8a5 5 0 0 1 10 0v3"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
