import type { Lang } from '@quiz-duel/shared';

/** Тексты бота. Язык - по language_code получателя. */
export const botTexts: Record<Lang, { start: string; play: string; startCommand: string }> = {
  ru: {
    start:
      'Привет! Это Quiz Duel - викторина 1 на 1 в реальном времени.\n\n' +
      'Вызовите друга, отвечайте быстрее и поднимайтесь в рейтинге. Нажмите «Играть».',
    play: 'Играть',
    startCommand: 'Открыть игру',
  },
  en: {
    start:
      'Hi! This is Quiz Duel - a real-time 1v1 quiz.\n\n' +
      'Challenge a friend, answer faster and climb the leaderboard. Tap “Play”.',
    play: 'Play',
    startCommand: 'Open the game',
  },
};
