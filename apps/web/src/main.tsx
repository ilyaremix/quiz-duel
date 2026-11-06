import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { langFromTelegram } from '@quiz-duel/shared';
import { setupTelegram } from './lib/telegram';
import { initI18n } from './i18n';
import { App } from './App';
import './styles.css';

const session = setupTelegram();

// До ответа сервера язык берём из Telegram (или браузера вне его);
// после /api/me его уточняет настройка профиля.
initI18n(langFromTelegram(session ? session.languageCode : navigator.language));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App session={session} />
    </QueryClientProvider>
  </StrictMode>,
);
