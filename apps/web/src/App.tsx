import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, ApiRequestError } from './lib/api';
import { closeMiniApp, type TelegramSession } from './lib/telegram';
import { useSocketStatus } from './lib/socket';
import { setLang } from './i18n';
import { LoadingScreen } from './screens/LoadingScreen';
import { FallbackScreen } from './screens/FallbackScreen';
import { HelloScreen } from './screens/HelloScreen';

/** Вне Telegram: заглушка с кнопкой, ведущей в мини-апп (адрес отдаёт сервер). */
function OutsideTelegram() {
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, retry: 1 });
  return (
    <FallbackScreen
      kind="outside"
      actionDisabled={!config.data}
      onAction={() => {
        if (config.data) window.location.href = config.data.appUrl;
      }}
    />
  );
}

function InTelegram({ session }: { session: TelegramSession }) {
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(session.initDataRaw),
    // На отказ initData повтор не поможет - нужен новый вход.
    retry: (count, error) => !(error instanceof ApiRequestError && error.isAuth) && count < 2,
  });
  const socket = useSocketStatus(me.data ? session.initDataRaw : null);

  useEffect(() => {
    if (me.data) setLang(me.data.lang);
  }, [me.data]);

  if (me.isPending || (me.isFetching && me.isError)) return <LoadingScreen />;
  if (me.isError) {
    const isAuth = me.error instanceof ApiRequestError && me.error.isAuth;
    return isAuth ? (
      <FallbackScreen kind="session" onAction={closeMiniApp} />
    ) : (
      <FallbackScreen kind="error" onAction={() => void me.refetch()} />
    );
  }
  return <HelloScreen me={me.data} socket={socket} />;
}

export function App({ session }: { session: TelegramSession | null }) {
  return session ? <InTelegram session={session} /> : <OutsideTelegram />;
}
