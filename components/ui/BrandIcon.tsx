'use client';

import { useState } from 'react';
import styles from './BrandIcon.module.css';

type BrandIconProps = {
  src: string;
  alt?: string;
  className?: string;
  rounded?: boolean;
};

export default function BrandIcon({ src, alt = '', className = '', rounded }: BrandIconProps) {
  const [loaded, setLoaded] = useState(false);

  return (
    <span className={`${styles.wrap} ${className}`.trim()}>
      {!loaded && <span className={`${styles.placeholder} ${rounded ? styles.rounded : ''}`} aria-hidden />}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        width={24}
        height={24}
        className={`${styles.img} ${rounded ? styles.rounded : ''} ${loaded ? styles.visible : styles.hidden}`}
        onLoad={() => setLoaded(true)}
        decoding="async"
      />
    </span>
  );
}
