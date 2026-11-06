import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { gameIdFromStartParam, type GameView, type MeResponse } from '@quiz-duel/shared';
import { api, ApiRequestError } from './lib/api';
import { closeMiniApp, type TelegramSession } from './lib/telegram';
import { gameActions, useGame } from './lib/game';
import { setLang } from './i18n';
import { useTranslation } from 'react-i18next';
import { OfflineStrip } from './components/Banner';
import { ToastHost } from './components/ToastHost';
import { LoadingScreen } from './screens/LoadingScreen';
import { FallbackScreen } from './screens/FallbackScreen';
import { HomeScreen } from './screens/HomeScreen';
import { CategorySheet } from './screens/CategorySheet';
import { ConsentSheet } from './screens/ConsentSheet';
import { LobbyWaitScreen } from './screens/LobbyWaitScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { LinkErrorScreen } from './screens/LinkErrorScreen';
import { GameStubScreen } from './screens/GameStubScreen';

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

/** Какой экран показать - решает только снимок партии с сервера. */
function GameRoute({ game, me }: { game: GameView; me: MeResponse }) {
  const iAmCreator = game.creatorId === game.me.userId;
  switch (game.phase) {
    case 'waiting':
      return <LobbyWaitScreen game={game} />;
    case 'lobby':
    case 'countdown':
      return game.opponent ? <LobbyScreen game={game} /> : <LobbyWaitScreen game={game} />;
    case 'expired':
      return <LinkErrorScreen kind="expired" docsAccepted={me.docsAccepted} />;
    case 'cancelled':
      if (game.cancelReason === 'creator') {
        return iAmCreator ? <HomeScreen me={me} /> : <LinkErrorScreen kind="cancelled" docsAccepted={me.docsAccepted} />;
      }
      return <GameStubScreen game={game} />;
    default:
      return <GameStubScreen game={game} />;
  }
}

function InTelegram({ session }: { session: TelegramSession }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(session.initDataRaw),
    // На отказ initData повтор не поможет - нужен новый вход.
    retry: (count, error) => !(error instanceof ApiRequestError && error.isAuth) && count < 2,
  });
  const config = useQuery({ queryKey: ['config'], queryFn: api.config, retry: 2 });
  const conn = useGame((s) => s.conn);
  const game = useGame((s) => s.game);
  const hidden = useGame((s) => s.hidden);
  const linkError = useGame((s) => s.linkError);

  useEffect(() => {
    if (me.data) setLang(me.data.lang);
  }, [me.data]);

  // Один сокет на всё время жизни приложения; по ссылке startapp=g_<id> сразу входим в игру.
  useEffect(() => {
    if (!me.data) return;
    gameActions.start(session.initDataRaw, gameIdFromStartParam(session.startParam), async () => {
      const docs = config.data?.docs ?? (await queryClient.fetchQuery({ queryKey: ['config'], queryFn: api.config })).docs;
      await api.consents(session.initDataRaw, { docs: ['terms', 'privacy'], version: docs.version });
      queryClient.setQueryData<MeResponse>(['me'], (prev) => (prev ? { ...prev, docsAccepted: true } : prev));
    });
  }, [me.data, session, config.data, queryClient]);

  if (me.isPending || (me.isFetching && me.isError)) return <LoadingScreen />;
  if (me.isError) {
    const isAuth = me.error instanceof ApiRequestError && me.error.isAuth;
    return isAuth ? (
      <FallbackScreen kind="session" onAction={closeMiniApp} />
    ) : (
      <FallbackScreen kind="error" onAction={() => void me.refetch()} />
    );
  }
  if (conn === 'replaced') return <FallbackScreen kind="otherDevice" onAction={gameActions.takeOver} />;
  // Пока не пришло первое приветствие сокета, не показываем главную: игрок может быть в партии.
  if (conn === 'connecting') return <LoadingScreen />;

  const screen = linkError ? (
    <LinkErrorScreen kind={linkError.kind} docsAccepted={me.data.docsAccepted} />
  ) : game && !hidden ? (
    <GameRoute game={game} me={me.data} />
  ) : (
    <HomeScreen me={me.data} />
  );

  return (
    <>
      {conn === 'reconnecting' && (
        <div className="qd-strip-in fixed inset-x-0 top-0 z-50">
          <OfflineStrip title={t('banner.offline.title')} />
        </div>
      )}
      {screen}
      <CategorySheet />
      <ConsentSheet docs={config.data?.docs} />
      <ToastHost />
    </>
  );
}

export function App({ session }: { session: TelegramSession | null }) {
  return session ? <InTelegram session={session} /> : <OutsideTelegram />;
}
