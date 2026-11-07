import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { langFromTelegram } from '@quiz-duel/shared';
import { setupTelegram } from './lib/telegram';
// Режим без анимаций ставится до первой отрисовки (настройка с прошлого входа, система, слабое устройство).
import './lib/motion';
import { cachedLang, initI18n } from './i18n';
import { App } from './App';
import { queryClient } from './lib/queryClient';
import './styles.css';

const session = setupTelegram();

// До ответа сервера - язык прошлого входа, иначе из Telegram (или браузера вне его);
// после /api/me его уточняет настройка профиля.
initI18n(cachedLang() ?? langFromTelegram(session ? session.languageCode : navigator.language));


createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App session={session} />
    </QueryClientProvider>
  </StrictMode>,
);
