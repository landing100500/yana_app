'use client';

import { useRef, useCallback, useEffect } from 'react';
import styles from './EmailEditor.module.css';
import { normalizeHtmlForEditor, normalizeHtmlForStorage } from '@/lib/mail-editor-html';

interface EmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function insertNodeAtCursor(node: Node) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  range.deleteContents();
  range.insertNode(node);
  range.setStartAfter(node);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
  return true;
}

export default function EmailEditor({ value, onChange, placeholder }: EmailEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastEmittedRef = useRef('');

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const raw = editorRef.current.innerHTML;
    const normalized = normalizeHtmlForStorage(raw);
    lastEmittedRef.current = normalized;
    onChange(normalized);
  }, [onChange]);

  const handleInput = () => {
    emitChange();
  };

  useEffect(() => {
    if (!editorRef.current) return;
    const displayHtml = normalizeHtmlForEditor(value || '');
    if (editorRef.current.innerHTML !== displayHtml && value !== lastEmittedRef.current) {
      editorRef.current.innerHTML = displayHtml || '';
      lastEmittedRef.current = value || '';
    }
  }, [value]);

  const insertLink = () => {
    const url = prompt('URL ссылки:', 'https://');
    if (!url || !editorRef.current) return;
    editorRef.current.focus();
    document.execCommand('createLink', false, url);
    emitChange();
  };

  const uploadImage = async (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await fetch('/api/admin/mail/upload-image', {
      method: 'POST',
      body: formData,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Upload failed');

    if (!editorRef.current) return;
    editorRef.current.focus();

    const img = document.createElement('img');
    img.src = normalizeHtmlForEditor(`<img src="${data.url}" />`).match(/src="([^"]+)"/)?.[1] || data.url;
    img.alt = '';
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    img.style.display = 'block';
    img.style.margin = '12px 0';
    img.style.borderRadius = '4px';

    if (!insertNodeAtCursor(img)) {
      editorRef.current.appendChild(img);
    }

    emitChange();
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadImage(file);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не удалось загрузить изображение');
    }
    e.target.value = '';
  };

  const exec = (command: string, val?: string) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    document.execCommand(command, false, val);
    emitChange();
  };

  return (
    <div className={styles.editorWrap}>
      <div className={styles.toolbar}>
        <button type="button" className={styles.toolBtn} onClick={() => exec('bold')} title="Жирный">
          <b>B</b>
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('italic')} title="Курсив">
          <i>I</i>
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('underline')} title="Подчёркнутый">
          <u>U</u>
        </button>
        <span className={styles.sep} />
        <select
          className={styles.select}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exec('fontName', e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">Шрифт</option>
          <option value="Arial">Arial</option>
          <option value="Georgia">Georgia</option>
          <option value="Times New Roman">Times New Roman</option>
          <option value="Verdana">Verdana</option>
          <option value="Tahoma">Tahoma</option>
        </select>
        <select
          className={styles.select}
          defaultValue=""
          onChange={(e) => {
            if (e.target.value) exec('fontSize', e.target.value);
            e.target.value = '';
          }}
        >
          <option value="">Размер</option>
          <option value="1">Мелкий</option>
          <option value="3">Обычный</option>
          <option value="5">Крупный</option>
          <option value="7">Очень крупный</option>
        </select>
        <span className={styles.sep} />
        <button type="button" className={styles.toolBtn} onClick={() => exec('justifyLeft')} title="По левому">
          ⬅
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('justifyCenter')} title="По центру">
          ↔
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('justifyRight')} title="По правому">
          ➡
        </button>
        <span className={styles.sep} />
        <button type="button" className={styles.toolBtn} onClick={insertLink} title="Ссылка">
          🔗
        </button>
        <button
          type="button"
          className={styles.toolBtn}
          onClick={() => fileInputRef.current?.click()}
          title="Изображение"
        >
          🖼
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          className={styles.hiddenInput}
          onChange={handleImageSelect}
        />
        <span className={styles.sep} />
        <button type="button" className={styles.toolBtn} onClick={() => exec('insertUnorderedList')} title="Список">
          •
        </button>
        <button type="button" className={styles.toolBtn} onClick={() => exec('removeFormat')} title="Очистить формат">
          ✕
        </button>
      </div>
      <div
        ref={editorRef}
        className={styles.editor}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Текст письма...'}
        onInput={handleInput}
      />
    </div>
  );
}
