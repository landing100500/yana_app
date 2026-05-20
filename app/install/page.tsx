'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getClientOS, type ClientOS } from '@/lib/client-os';
import styles from './page.module.css';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function osLabel(os: ClientOS): string {
  switch (os) {
    case 'ios':
      return 'iPhone или iPad';
    case 'android':
      return 'Android';
    case 'windows':
      return 'Windows';
    case 'macos':
      return 'macOS';
    case 'linux':
      return 'Linux';
    default:
      return 'Устройство';
  }
}

function Steps({ children }: { children: React.ReactNode }) {
  return (
    <>
      <p className={styles.stepsTitle}>Как добавить иконку</p>
      <ol className={styles.steps}>{children}</ol>
    </>
  );
}

export default function InstallAppPage() {
  const [os, setOs] = useState<ClientOS>('unknown');
  const [origin, setOrigin] = useState('https://yasna.chat');
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    setOs(getClientOS());
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onBip);
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  const steps = useMemo(() => {
    const host = <span className={styles.origin}>{origin}</span>;

    if (os === 'ios') {
      return (
        <Steps>
          <li>Откройте {host} в браузере Safari (не во встроенном браузере других приложений).</li>
          <li>
            Нажмите кнопку «Поделиться» <strong>(квадрат со стрелкой вверх)</strong> внизу или сверху.
          </li>
          <li>
            Выберите <strong>«На экран «Домой»»</strong> и подтвердите. На главном экране появится
            иконка ЯСНА — по ней откроется сайт.
          </li>
        </Steps>
      );
    }

    if (os === 'android') {
      return (
        <Steps>
          <li>
            Откройте {host} в <strong>Chrome</strong> (или другом браузере на базе Chromium).
          </li>
          <li>
            Если браузер предложит установку — подтвердите. Иначе: меню <strong>(⋮)</strong> →{' '}
            <strong>«Установить приложение»</strong> или <strong>«Добавить на главный экран»</strong>.
          </li>
          <li>После установки запускайте ЯСНА с иконки на рабочем столе или в списке приложений.</li>
        </Steps>
      );
    }

    if (os === 'windows' || os === 'linux') {
      return (
        <Steps>
          <li>
            Откройте {host} в <strong>Chrome</strong> или <strong>Microsoft Edge</strong>.
          </li>
          <li>
            Нажмите значок установки в адресной строке или меню <strong>(⋮)</strong> →{' '}
            <strong>«Установить ЯСНА…»</strong> / <strong>«Приложения»</strong> → установка сайта как
            приложения.
          </li>
          <li>Запускайте ЯСНА из меню «Пуск», панели задач или ярлыка на рабочем столе.</li>
        </Steps>
      );
    }

    if (os === 'macos') {
      return (
        <Steps>
          <li>
            Откройте {host} в <strong>Chrome</strong> или <strong>Edge</strong>.
          </li>
          <li>
            Меню <strong>(⋮)</strong> → <strong>«Установить ЯСНА…»</strong> или кнопка установки справа в
            адресной строке. В Safari: <strong>Поделиться</strong> → при наличии пункта{' '}
            <strong>«Добавить в Dock»</strong>.
          </li>
          <li>После установки открывайте приложение из Dock или Launchpad.</li>
        </Steps>
      );
    }

    return (
      <Steps>
        <li>
          На телефоне: iPhone/iPad — через Safari, кнопку «Поделиться» → «На экран Домой». Android —
          Chrome, меню (⋮) → «Установить приложение».
        </li>
        <li>
          На компьютере: Chrome или Edge — меню (⋮) → установка сайта как приложения или значок в
          адресной строке.
        </li>
        <li>Адрес для установки: {host}</li>
      </Steps>
    );
  }, [os, origin]);

  const runInstall = async () => {
    if (!deferred) return;
    setInstallBusy(true);
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } finally {
      setDeferred(null);
      setInstallBusy(false);
    }
  };

  return (
    <div className={styles.container}>
      <Link href="/" className={styles.back}>
        ← На главную
      </Link>

      <div className={styles.card}>
        <h1 className={styles.title}>Установить ЯСНА</h1>
        <p className={styles.sub}>
          Иконка на экране или в меню приложений открывает сайт как отдельное приложение — удобнее,
          чем каждый раз искать вкладку в браузере.
        </p>

        <div className={styles.iconWrap}>
          <Image
            src="/icons/yasna-app-192.png"
            alt=""
            width={88}
            height={88}
            className={styles.icon}
            priority
          />
        </div>

        {deferred && (
          <button
            type="button"
            className={styles.installBtn}
            onClick={() => void runInstall()}
            disabled={installBusy}
          >
            {installBusy ? 'Подождите…' : 'Установить ЯСНА'}
          </button>
        )}

        <div className={styles.osBadge}>Определено: {osLabel(os)}</div>
        {steps}

        <p className={styles.hint}>
          Кнопка «Установить» появляется только в поддерживаемых браузерах (обычно Chrome и Edge),
          если сайт открыт по HTTPS и выполнены условия PWA. В Firefox установка как приложения
          может быть недоступна — используйте Chrome или Edge.
        </p>
      </div>
    </div>
  );
}
