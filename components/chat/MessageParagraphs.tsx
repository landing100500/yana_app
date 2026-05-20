'use client';

import styles from '@/app/chat/page.module.css';

function formatInlineHtml(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\((\/[^)\s]+)\)/g, '<a href="$2" class="chatInlineLink">$1</a>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

type Props = {
  content: string;
  onTariffsClick?: () => void;
};

export default function MessageParagraphs({ content, onTariffsClick }: Props) {
  const handleLinkClick = (e: React.MouseEvent<HTMLParagraphElement>) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'A' && target.getAttribute('href') === '/tariffs') {
      e.preventDefault();
      if (onTariffsClick) onTariffsClick();
      else window.location.href = '/tariffs';
    }
  };

  return (
    <>
      {content.split(/\n\n+/).map((paragraph, idx) => {
        const trimmed = paragraph.trim();
        if (!trimmed) return null;

        const isH3 = /^#{3}\s+/.test(trimmed);
        if (isH3) {
          const html = formatInlineHtml(trimmed.replace(/^#{3}\s+/, ''));
          return (
            <div key={idx}>
              <p
                className={styles.sectionTitle || styles.answerParagraph}
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={handleLinkClick}
              />
            </div>
          );
        }

        const isQuestion = /^\*\*\d+\./.test(trimmed);
        if (isQuestion) {
          const trimmedNoHints = trimmed
            .replace(/\s*\([^)]*\)/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
          const html = formatInlineHtml(trimmedNoHints);
          return (
            <div key={idx}>
              <p
                className={styles.questionParagraph}
                dangerouslySetInnerHTML={{ __html: html }}
                onClick={handleLinkClick}
              />
            </div>
          );
        }

        const html = formatInlineHtml(trimmed);
        return (
          <div key={idx}>
            <p
              className={styles.answerParagraph}
              dangerouslySetInnerHTML={{ __html: html }}
              onClick={handleLinkClick}
            />
          </div>
        );
      })}
    </>
  );
}
