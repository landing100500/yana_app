'use client';

import styles from './CircularProgressLoader.module.css';

type Props = {
  progress: number;
  label?: string;
  fullScreen?: boolean;
};

const SIZE = 112;
const STROKE = 7;

export default function CircularProgressLoader({
  progress,
  label = 'Загрузка',
  fullScreen = true,
}: Props) {
  const clamped = Math.min(100, Math.max(0, Math.round(progress)));
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const center = SIZE / 2;

  return (
    <div
      className={fullScreen ? styles.fullScreen : styles.inline}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
    >
      <div className={styles.inner}>
        <svg width={SIZE} height={SIZE} className={styles.svg} aria-hidden>
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            className={styles.track}
            strokeWidth={STROKE}
          />
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            className={styles.fill}
            strokeWidth={STROKE}
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${center} ${center})`}
          />
        </svg>
        <span className={styles.percent}>{clamped}%</span>
      </div>
      {label ? <p className={styles.label}>{label}</p> : null}
    </div>
  );
}
