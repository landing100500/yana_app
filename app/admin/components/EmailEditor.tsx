'use client';

import { useRef, useCallback, useEffect } from 'react';
import styles from './EmailEditor.module.css';

interface EmailEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export default function EmailEditor({ value, onChange, placeholder }: EmailEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const exec = useCallback((command: string, val?: string) => {
    document.execCommand(command, false, val);
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const handleInput = () => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  };

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== value) {
      editorRef.current.innerHTML = value;
    }
  }, [value]);

  const insertLink = () => {
    const url = prompt('URL ссылки:', 'https://');
    if (url) exec('createLink', url);
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
    const imgHtml = `<img src="${data.url}" alt="" style="max-width:100%;height:auto;display:block;margin:12px 0;" />`;
    document.execCommand('insertHTML', false, imgHtml);
    onChange(editorRef.current.innerHTML);
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
