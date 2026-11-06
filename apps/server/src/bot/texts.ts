import type { GameCategory, Lang } from '@quiz-duel/shared';

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

/** Карточка «Вызов на дуэль» для shareMessage. Язык - создателя игры. */
export const inviteTexts: Record<
  Lang,
  { title: string; description: string; body: (name: string, category: string) => string; accept: string; categories: Record<GameCategory, string> }
> = {
  ru: {
    title: 'Вызов на дуэль',
    description: 'Викторина 1 на 1 - кто первым примет, тот и соперник',
    body: (name, category) =>
      `⚔️ <b>Вызов на дуэль</b>\n\n${name ? `${name} зовёт` : 'Вас зовут'} в Quiz Duel: 10 вопросов, 15 секунд на каждый.\n` +
      `Категория: ${category}\n\nКто первым нажмёт «Принять», тот и соперник.`,
    accept: 'Принять',
    categories: {
      mix: 'Микс',
      science: 'Наука и природа',
      history: 'История и география',
      culture: 'Кино, музыка и книги',
      sport: 'Спорт',
      tech: 'Технологии и интернет',
    },
  },
  en: {
    title: 'Duel challenge',
    description: 'A 1v1 quiz - whoever accepts first is the opponent',
    body: (name, category) =>
      `⚔️ <b>Duel challenge</b>\n\n${name ? `${name} challenges you` : 'You are challenged'} to Quiz Duel: 10 questions, 15 seconds each.\n` +
      `Category: ${category}\n\nWhoever taps “Accept” first is the opponent.`,
    accept: 'Accept',
    categories: {
      mix: 'Mix',
      science: 'Science & Nature',
      history: 'History & Geography',
      culture: 'Film, Music & Books',
      sport: 'Sports',
      tech: 'Tech & Internet',
    },
  },
};
