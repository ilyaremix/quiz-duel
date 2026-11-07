import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ACTIVE_PHASES, gameIdFromStartParam, TIMINGS, type GameView, type MeResponse } from '@quiz-duel/shared';
import { api, ApiRequestError, queryKeys, setSessionAuth } from './lib/api';
import { askWriteAccess, closeMiniApp, onBack, setGameGuards, type TelegramSession } from './lib/telegram';
import { gameActions, useGame } from './lib/game';
import { setLang } from './i18n';
import { setMotionSetting } from './lib/motion';
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
import { ReviewScreen } from './screens/ReviewScreen';
import { LeaderboardScreen } from './screens/LeaderboardScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { OppSheet } from './screens/OppSheet';
import { AchievementsScreen } from './screens/AchievementsScreen';
import { SoloResultScreen } from './screens/SoloResultScreen';
import { SearchScreen } from './screens/SearchScreen';
import { SettingsScreen } from './screens/SettingsScreen';

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
function GameRoute({ game, me, review }: { game: GameView; me: MeResponse; review: string | null }) {
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
      if (game.mode === 'solo') return <SoloResultScreen game={game} />;
      return review ? <ReviewScreen gameId={review} /> : <ResultScreen game={game} />;
    case 'expired':
      return <LinkErrorScreen kind="expired" docsAccepted={me.docsAccepted} />;
    case 'cancelled':
      if (game.mode === 'solo') return <SoloResultScreen game={game} />;
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

/** Вкладки нижнего меню, когда партии на экране нет. */
function TabsRoute({ me }: { me: MeResponse }) {
  const tab = useGame((s) => s.tab);
  const review = useGame((s) => s.review);
  const achievements = useGame((s) => s.achievements);
  const settings = useGame((s) => s.settings);
  if (review) return <ReviewScreen gameId={review} />;
  if (settings && tab === 'home') return <SettingsScreen me={me} />;
  if (achievements && tab === 'profile') return <AchievementsScreen />;
  if (tab === 'rating') return <LeaderboardScreen me={me} />;
  if (tab === 'profile') return <ProfileScreen me={me} />;
  return <HomeScreen me={me} />;
}

/** Итоги посчитаны (пришёл рейтинг) - профиль, история и лидерборд перезапрашиваются. */
function useRefreshAfterGame(game: GameView | null) {
  const queryClient = useQueryClient();
  const settled = game?.result?.rating ? `${game.id}:${game.result.rating.after}` : game?.result?.solo ? `${game.id}:solo` : null;
  const oppId = game?.opponent?.userId;
  useEffect(() => {
    if (!settled) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.profile });
    void queryClient.invalidateQueries({ queryKey: queryKeys.leaderboard });
    void queryClient.invalidateQueries({ queryKey: queryKeys.achievements });
    if (oppId) void queryClient.invalidateQueries({ queryKey: queryKeys.player(oppId) });
  }, [settled, oppId, queryClient]);
}

/**
 * В лобби (ждём соперника или он уже пришёл) один раз за сессию просим разрешение писать:
 * бот позовёт, когда соперник зайдёт, будет ждать или предложит реванш. Уже разрешил - не спрашиваем.
 */
let writeAccessAsked = false;
function useWriteAccessAsk(game: GameView | null, me: MeResponse | undefined) {
  const queryClient = useQueryClient();
  const inLobby = Boolean(game && (game.phase === 'waiting' || game.phase === 'lobby'));
  useEffect(() => {
    if (!inLobby || !me || me.writeAccess || writeAccessAsked) return;
    writeAccessAsked = true;
    void askWriteAccess().then(async (allowed) => {
      if (!allowed) return;
      const saved = await api.settings({ writeAccess: true }).catch(() => null);
      if (saved) queryClient.setQueryData<MeResponse>(['me'], (prev) => (prev ? { ...prev, writeAccess: true } : prev));
    });
  }, [inLobby, me, queryClient]);
}

function InTelegram({ session }: { session: TelegramSession }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  setSessionAuth(session.initDataRaw);
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
  const review = useGame((s) => s.review);
  const search = useGame((s) => s.search);
  useRefreshAfterGame(game);
  useWriteAccessAsk(game, me.data);

  useEffect(() => {
    if (!me.data) return;
    setLang(me.data.lang);
    setMotionSetting(me.data.reducedMotion);
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
  // Сокет не принял initData (приложение открыто больше суток) - как и с REST, нужен новый вход.
  if (conn === 'auth') return <FallbackScreen kind="session" onAction={closeMiniApp} />;
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
    <GameRoute game={game} me={me.data} review={review} />
  ) : search ? (
    <SearchScreen me={me.data} />
  ) : (
    <TabsRoute me={me.data} />
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
      <OppSheet me={me.data} />
      <ToastHost />
    </>
  );
}

export function App({ session }: { session: TelegramSession | null }) {
  return session ? <InTelegram session={session} /> : <OutsideTelegram />;
}
