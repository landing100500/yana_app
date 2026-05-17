'use client';

import { useEffect, useState } from 'react';
import CircularProgressLoader from './CircularProgressLoader';

/** Краткий прелоадер на время навигации (до гидрации страницы) */
export default function RouteLoadScreen() {
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const id = window.setInterval(() => {
      setProgress((p) => (p >= 88 ? p : p + 4));
    }, 120);
    return () => window.clearInterval(id);
  }, []);

  return <CircularProgressLoader progress={progress} />;
}
