import Link from 'next/link';
import { LEGAL_ENTITY } from '@/lib/legal-info';
import styles from './SiteFooter.module.css';

type SiteFooterProps = {
  className?: string;
  showInstallLink?: boolean;
};

export default function SiteFooter({ className, showInstallLink = false }: SiteFooterProps) {
  const year = new Date().getFullYear();

  return (
    <footer className={`${styles.footer}${className ? ` ${className}` : ''}`}>
      <div className={styles.orgLine}>
        {LEGAL_ENTITY.name} · ИНН {LEGAL_ENTITY.inn} ·{' '}
        <a href={LEGAL_ENTITY.phoneHref} className={styles.link}>
          {LEGAL_ENTITY.phone}
        </a>
      </div>
      <nav className={styles.links} aria-label="Юридическая информация">
        <Link href="/privacy" className={styles.link}>
          Политика конфиденциальности
        </Link>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <Link href="/offer" className={styles.link}>
          Публичная оферта
        </Link>
        <span className={styles.separator} aria-hidden="true">
          ·
        </span>
        <Link href="/tariffs" className={styles.link}>
          Тарифы
        </Link>
        {showInstallLink && (
          <>
            <span className={styles.separator} aria-hidden="true">
              ·
            </span>
            <Link href="/install" className={styles.link}>
              Установить на устройство
            </Link>
          </>
        )}
      </nav>
      <div className={styles.copy}>
        © {year} {LEGAL_ENTITY.siteName}
      </div>
    </footer>
  );
}
