'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  addMonths,
  format,
  getDaysInMonth,
  isValid,
  parse,
  startOfMonth,
  subMonths,
} from 'date-fns';
import { ru } from 'date-fns/locale';
import styles from './DatePicker.module.css';

const ISO_FORMAT = 'yyyy-MM-dd';
const DISPLAY_FORMAT = 'dd.MM.yyyy';

function parseIso(value: string): Date | null {
  if (!value) return null;
  const d = parse(value, ISO_FORMAT, new Date());
  return isValid(d) ? d : null;
}

function parseDisplay(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const d = parse(trimmed, DISPLAY_FORMAT, new Date());
  return isValid(d) ? d : null;
}

function toIso(date: Date): string {
  return format(date, ISO_FORMAT);
}

function clampDate(date: Date, min?: string, max?: string): Date {
  let result = date;
  const minDate = min ? parseIso(min) : null;
  const maxDate = max ? parseIso(max) : null;
  if (minDate && result < minDate) result = minDate;
  if (maxDate && result > maxDate) result = maxDate;
  return result;
}

interface DatePickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Стили поля ввода (как у .input / .modalInput на странице). */
  className?: string;
  /** Обёртка, например для ширины в сетке фильтров. */
  wrapperClassName?: string;
  /** Если className не передан — светлая или тёмная тема по умолчанию. */
  theme?: 'light' | 'dark';
  required?: boolean;
  disabled?: boolean;
  min?: string;
  max?: string;
  placeholder?: string;
}

export default function DatePicker({
  value,
  onChange,
  className = '',
  wrapperClassName = '',
  theme = 'light',
  required,
  disabled,
  min,
  max,
  placeholder = 'ДД.ММ.ГГГГ',
}: DatePickerProps) {
  const isDark = theme === 'dark';
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [viewMonth, setViewMonth] = useState(() => parseIso(value) ?? new Date());

  const selected = useMemo(() => parseIso(value), [value]);

  useEffect(() => {
    setText(selected ? format(selected, DISPLAY_FORMAT) : '');
    if (selected) setViewMonth(startOfMonth(selected));
  }, [value, selected]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const commitDate = (date: Date) => {
    const clamped = clampDate(date, min, max);
    onChange(toIso(clamped));
    setText(format(clamped, DISPLAY_FORMAT));
    setOpen(false);
  };

  const handleTextBlur = () => {
    if (!text.trim()) {
      onChange('');
      return;
    }
    const parsed = parseDisplay(text);
    if (!parsed) {
      setText(selected ? format(selected, DISPLAY_FORMAT) : '');
      return;
    }
    commitDate(parsed);
  };

  const yearOptions = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const minYear = min ? (parseIso(min)?.getFullYear() ?? currentYear - 120) : currentYear - 120;
    const maxYear = max ? (parseIso(max)?.getFullYear() ?? currentYear + 5) : currentYear + 5;
    const years: number[] = [];
    for (let y = maxYear; y >= minYear; y -= 1) years.push(y);
    return years;
  }, [min, max]);

  const monthStart = startOfMonth(viewMonth);
  const daysInMonth = getDaysInMonth(monthStart);
  const firstWeekday = (monthStart.getDay() + 6) % 7;
  const dayCells: Array<Date | null> = [];
  for (let i = 0; i < firstWeekday; i += 1) dayCells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) {
    dayCells.push(new Date(monthStart.getFullYear(), monthStart.getMonth(), day));
  }

  const isDisabledDay = (date: Date) => {
    const iso = toIso(date);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const inputClassName = [
    styles.inputField,
    className || (isDark ? styles.defaultInputDark : styles.defaultInput),
  ]
    .filter(Boolean)
    .join(' ');

  const calendarBtnClass = isDark ? `${styles.calendarBtn} ${styles.calendarBtnDark}` : styles.calendarBtn;
  const popoverClass = isDark ? `${styles.popover} ${styles.popoverDark}` : styles.popover;
  const navBtnClass = isDark ? `${styles.navBtn} ${styles.navBtnDark}` : styles.navBtn;
  const selectClass = isDark ? `${styles.select} ${styles.selectDark}` : styles.select;
  const weekdaysClass = isDark ? `${styles.weekdays} ${styles.weekdaysDark}` : styles.weekdays;

  const useDarkUi = isDark || Boolean(className);

  return (
    <div
      ref={rootRef}
      className={`${styles.root} ${useDarkUi ? 'darkUi' : ''} ${wrapperClassName}`.trim()}
    >
      <div className={styles.inputRow}>
        <input
          type="text"
          className={inputClassName}
          value={text}
          placeholder={placeholder}
          required={required}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          list={listId}
          onChange={(e) => setText(e.target.value)}
          onBlur={handleTextBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleTextBlur();
            }
          }}
        />
        <button
          type="button"
          className={calendarBtnClass}
          disabled={disabled}
          aria-label="Открыть календарь"
          onClick={() => setOpen((v) => !v)}
        >
          📅
        </button>
      </div>
      <datalist id={listId}>
        {yearOptions.slice(0, 3).map((y) => (
          <option key={y} value={`01.01.${y}`} />
        ))}
      </datalist>

      {open && !disabled && (
        <div className={popoverClass} role="dialog" aria-label="Выбор даты">
          <div className={styles.nav}>
            <button type="button" className={navBtnClass} onClick={() => setViewMonth((m) => subMonths(m, 1))}>
              ‹
            </button>
            <div className={styles.selects}>
              <select
                className={selectClass}
                value={viewMonth.getMonth()}
                onChange={(e) =>
                  setViewMonth(new Date(viewMonth.getFullYear(), Number(e.target.value), 1))
                }
              >
                {Array.from({ length: 12 }, (_, i) => (
                  <option key={i} value={i}>
                    {format(new Date(2020, i, 1), 'LLLL', { locale: ru })}
                  </option>
                ))}
              </select>
              <select
                className={selectClass}
                value={viewMonth.getFullYear()}
                onChange={(e) =>
                  setViewMonth(new Date(Number(e.target.value), viewMonth.getMonth(), 1))
                }
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <button type="button" className={navBtnClass} onClick={() => setViewMonth((m) => addMonths(m, 1))}>
              ›
            </button>
          </div>

          <div className={weekdaysClass}>
            {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>

          <div className={styles.grid}>
            {dayCells.map((date, idx) => {
              if (!date) return <span key={`empty-${idx}`} className={styles.emptyCell} />;
              const iso = toIso(date);
              const isSelected = value === iso;
              const disabledDay = isDisabledDay(date);
              return (
                <button
                  key={iso}
                  type="button"
                  className={`${styles.day} ${isSelected ? styles.daySelected : ''}`}
                  disabled={disabledDay}
                  onClick={() => commitDate(date)}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
