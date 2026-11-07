import { QueryClient } from '@tanstack/react-query';

/** Один кэш на приложение: его же обновляют действия магазина и пуши сервера. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false },
  },
});
