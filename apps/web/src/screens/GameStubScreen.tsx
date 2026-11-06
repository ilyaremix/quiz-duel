import { useTranslation } from 'react-i18next';
import type { GameView } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { CategoryChip } from '../components/CategoryTile';
import { Notice } from '../components/Notice';
import { gameActions } from '../lib/game';

/**
 * Временный экран (этап 4): партия уже идёт на сервере по таймерам,
 * а экраны вопроса, раскрытия и итогов подключаются на этапах 5 и 7.
 */
export function GameStubScreen({ game }: { game: GameView }) {
  const { t } = useTranslation();
  const n = game.question ? game.question.index + 1 : 1;
  const kind = game.phase === 'finished' ? 'finished' : game.phase === 'cancelled' ? 'noAnswers' : 'live';
  const title = kind === 'live' ? t('stub.title') : kind === 'finished' ? t('stub.finished') : t('stub.noAnswers');
  const text = kind === 'live' ? t('stub.text', { n }) : kind === 'finished' ? t('stub.finishedText') : t('stub.noAnswersText');

  return (
    <main className="qd-screen qd-screen-in flex flex-col">
      <div className="flex justify-center">
        <CategoryChip cat={game.category} />
      </div>
      <div className="grow" />
      <div className="mb-6 flex items-center justify-center gap-4">
        <Avatar id={game.me.userId} name={game.me.name} photoUrl={game.me.photoUrl} size={64} ring="me" />
        <span className="text-[13px] font-black text-hint">VS</span>
        {game.opponent && <Avatar id={game.opponent.userId} name={game.opponent.name} photoUrl={game.opponent.photoUrl} size={64} ring="opp" />}
      </div>
      <Notice title={title} text={text} />
      <div className="grow" />
      <Button variant="secondary" onClick={gameActions.goHome}>
        {t('stub.home')}
      </Button>
    </main>
  );
}
