import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_PHASES, gameIdFromStartParam, TIMINGS, type GameView, type MeResponse } from '@quiz-duel/shared';
import { api, ApiRequestError } from './lib/api';
import { closeMiniApp, onBack, setGameGuards, type TelegramSession } from './lib/telegram';
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
import { VsScreen } from './screens/VsScreen';
import { QuestionScreen } from './screens/QuestionScreen';
import { ResultScreen } from './screens/ResultScreen';
import { ExitDialog } from './components/ExitDialog';
import { useServerNow } from './hooks/useServerNow';
import { OnboardingScreen } from './screens/OnboardingScreen';

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

/** Отсчёт: первые 3 с - в лобби («Старт через 3…»), последние 3 с - экран VS с 3-2-1. */
function CountdownRoute({ game }: { game: GameView }) {
  const now = useServerNow(100);
  const left = (game.phaseEndsAt ?? now) - now;
  if (left > TIMINGS.vsMs || !game.opponent) return <LobbyScreen game={game} />;
  const count = Math.min(3, Math.max(1, Math.ceil(left / 1000))) as 1 | 2 | 3;
  return <VsScreen game={game} count={count} />;
}

/** Какой экран показать - решает только снимок партии с сервера. */
function GameRoute({ game, me }: { game: GameView; me: MeResponse }) {
  const iAmCreator = game.creatorId === game.me.userId;
  switch (game.phase) {
    case 'waiting':
      return <LobbyWaitScreen game={game} />;
    case 'lobby':
      return game.opponent ? <LobbyScreen game={game} /> : <LobbyWaitScreen game={game} />;
    case 'countdown':
      return <CountdownRoute game={game} />;
    case 'question':
    case 'reveal':
      return game.question ? <QuestionScreen game={game} /> : <LoadingScreen />;
    case 'finished':
      return <ResultScreen game={game} />;
    case 'expired':
      return <LinkErrorScreen kind="expired" docsAccepted={me.docsAccepted} />;
    case 'cancelled':
      if (game.cancelReason === 'creator') {
        return iAmCreator ? <HomeScreen me={me} /> : <LinkErrorScreen kind="cancelled" docsAccepted={me.docsAccepted} />;
      }
      return <ResultScreen game={game} />;
  }
}

/**
 * Пока идёт партия: свайп вниз не закрывает приложение, закрытие спрашивает
 * подтверждение, а системная «Назад» на VS и вопросе открывает «Выйти из партии?».
 */
function useGameChrome(game: GameView | null, onScreen: boolean) {
  const active = Boolean(game && ACTIVE_PHASES.includes(game.phase));
  useEffect(() => {
    setGameGuards(active);
    return () => setGameGuards(false);
  }, [active]);

  // В лобби-части отсчёта у игрока своя кнопка «Выйти из лобби»; «Назад» - с VS и дальше.
  const now = useServerNow(active && game?.phase === 'countdown' ? 250 : 60_000);
  const inVs = game?.phase === 'countdown' && (game.phaseEndsAt ?? 0) - now <= TIMINGS.vsMs;
  const back = onScreen && active && (inVs || game?.phase === 'question' || game?.phase === 'reveal');
  useEffect(() => (back ? onBack(gameActions.openExit) : undefined), [back]);
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
  const linkEntry = useGame((s) => s.linkEntry);
  const consent = useGame((s) => s.consent);

  useEffect(() => {
    if (me.data) setLang(me.data.lang);
  }, [me.data]);

  const gameOnScreen = Boolean(game && !hidden && !linkError && conn !== 'replaced');
  useGameChrome(game, gameOnScreen);

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
  // Пока не пришло первое приветствие сокета или не решился вход по ссылке, главную не показываем:
  // игрок может быть в партии.
  if (conn === 'connecting' || (linkEntry && !linkError && !consent)) return <LoadingScreen />;

  // Первый вход (или новая версия документов): онбординг, на 3-м слайде - галочки.
  // Пришедшие по ссылке принимают документы в шторке перед лобби; закрыли шторку - сюда же.
  const onboarding = !me.data.docsAccepted && !game && !linkError && !consent;

  const screen = onboarding ? (
    <OnboardingScreen me={me.data} docs={config.data?.docs} />
  ) : linkError ? (
    <LinkErrorScreen kind={linkError.kind} docsAccepted={me.data.docsAccepted} />
  ) : game && !hidden ? (
    <GameRoute game={game} me={me.data} />
  ) : (
    <HomeScreen me={me.data} />
  );

  return (
    <>
      {/* На экране вопроса полоса «Переподключаемся…» встроена в сам экран. */}
      {conn === 'reconnecting' && !(gameOnScreen && (game?.phase === 'question' || game?.phase === 'reveal')) && (
        <div className="qd-strip-in fixed inset-x-0 top-0 z-50">
          <OfflineStrip title={t('banner.offline.title')} />
        </div>
      )}
      {screen}
      <CategorySheet />
      <ConsentSheet docs={config.data?.docs} />
      <ExitDialog />
      <ToastHost />
    </>
  );
}

export function App({ session }: { session: TelegramSession | null }) {
  return session ? <InTelegram session={session} /> : <OutsideTelegram />;
}
