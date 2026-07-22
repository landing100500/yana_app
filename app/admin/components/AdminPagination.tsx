'use client';

import styles from './AdminPagination.module.css';

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  total: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  className?: string;
}

export default function AdminPagination({
  page,
  totalPages,
  total,
  loading = false,
  onPageChange,
  className,
}: AdminPaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <div className={`${styles.pagination} ${className || ''}`}>
      <button
        type="button"
        className={styles.btn}
        disabled={page <= 1 || loading}
        onClick={() => onPageChange(page - 1)}
      >
        ← Назад
      </button>
      <span className={styles.info}>
        Стр. {page} из {totalPages} ({total} записей)
      </span>
      <button
        type="button"
        className={styles.btn}
        disabled={page >= totalPages || loading}
        onClick={() => onPageChange(page + 1)}
      >
        Вперёд →
      </button>
    </div>
  );
}
