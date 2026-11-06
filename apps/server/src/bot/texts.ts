import type { GameCategory, Lang } from '@quiz-duel/shared';
import type { GameAlert } from '../game/manager.js';

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
  {
    title: string;
    description: string;
    body: (name: string, category: string) => string;
    accept: string;
    categories: Record<GameCategory, string>;
    /** Inline-режим: кнопка над результатами, когда карточку дать нельзя. */
    inlineConsent: string;
    inlineBusy: string;
    inlineOpen: string;
  }
> = {
  ru: {
    title: 'Вызов на дуэль',
    description: 'Викторина 1 на 1 - кто первым примет, тот и соперник',
    body: (name, category) =>
      `⚔️ <b>Вызов на дуэль</b>\n\n${name ? `${name} зовёт` : 'Вас зовут'} в Quiz Duel: 10 вопросов, 15 секунд на каждый.\n` +
      `Категория: ${category}\n\nКто первым нажмёт «Принять», тот и соперник.`,
    accept: 'Принять',
    inlineConsent: 'Откройте Quiz Duel и примите документы',
    inlineBusy: 'У вас идёт партия - вернуться в игру',
    inlineOpen: 'Открыть Quiz Duel',
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
    inlineConsent: 'Open Quiz Duel and accept the documents',
    inlineBusy: 'You have a game in progress - go back',
    inlineOpen: 'Open Quiz Duel',
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

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ru = (n: number) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
const en = (n: number) => new Intl.NumberFormat('en-US').format(Math.abs(n));
const signed = (d: number, fmt: (n: number) => string) => (d > 0 ? `+${fmt(d)}` : d < 0 ? `−${fmt(d)}` : '0');

/** Уведомления от бота: текст и подпись кнопки. Язык - получателя. */
export const alertTexts: Record<Lang, { render: (a: GameAlert) => { text: string; button: string } }> = {
  ru: {
    render(a) {
      const opp = a.opponent ? `<b>${esc(a.opponent)}</b>` : 'Соперник';
      switch (a.kind) {
        case 'joined':
          return { text: `⚔️ ${opp} принял ваш вызов и ждёт в лобби. Нажмите «Готов», чтобы начать.`, button: 'Открыть лобби' };
        case 'waitingLobby':
          return { text: `⏳ ${opp} готов и ждёт вас в лобби.`, button: 'Вернуться' };
        case 'waitingGame':
          return { text: `⏳ Партия идёт, ${opp} ждёт. Вернитесь за 30 секунд, иначе засчитают техническое поражение.`, button: 'Вернуться в партию' };
        case 'rematch':
          return { text: `🔁 ${opp} предлагает реванш. Ответить можно в течение 30 секунд.`, button: 'Ответить' };
        case 'result': {
          const r = a.result!;
          const head =
            r.outcome === 'win' ? (r.technical ? '🏆 Техническая победа' : '🏆 Победа') : r.outcome === 'loss' ? (r.technical ? '😔 Техническое поражение' : '😔 Поражение') : '🤝 Ничья';
          const rating = r.ratingAfter !== null && r.delta !== null ? `\nРейтинг ${ru(r.ratingAfter)} (${signed(r.delta, ru)})` : '';
          return { text: `${head} - вы против ${opp}: ${ru(r.me)} : ${ru(r.opp)}${rating}`, button: 'Итоги' };
        }
      }
    },
  },
  en: {
    render(a) {
      const opp = a.opponent ? `<b>${esc(a.opponent)}</b>` : 'Your opponent';
      switch (a.kind) {
        case 'joined':
          return { text: `⚔️ ${opp} accepted your challenge and is waiting in the lobby. Tap “Ready” to start.`, button: 'Open lobby' };
        case 'waitingLobby':
          return { text: `⏳ ${opp} is ready and waiting for you in the lobby.`, button: 'Return' };
        case 'waitingGame':
          return { text: `⏳ Your game is on and ${opp} is waiting. Come back within 30 seconds or it counts as a technical loss.`, button: 'Back to the game' };
        case 'rematch':
          return { text: `🔁 ${opp} wants a rematch. You have 30 seconds to answer.`, button: 'Answer' };
        case 'result': {
          const r = a.result!;
          const head =
            r.outcome === 'win' ? (r.technical ? '🏆 Technical win' : '🏆 Victory') : r.outcome === 'loss' ? (r.technical ? '😔 Technical loss' : '😔 Defeat') : '🤝 Draw';
          const rating = r.ratingAfter !== null && r.delta !== null ? `\nRating ${en(r.ratingAfter)} (${signed(r.delta, en)})` : '';
          return { text: `${head} - you vs ${opp}: ${en(r.me)} : ${en(r.opp)}${rating}`, button: 'Results' };
        }
      }
    },
  },
};

/** Карточка «Поделиться результатом». Язык - того, кто делится. Нейтрально, без склонения имён. */
export const shareTexts: Record<Lang, { title: string; play: string; body: (outcome: 'win' | 'loss' | 'draw', me: number, opp: number, opponent: string) => string }> = {
  ru: {
    title: 'Мой результат в Quiz Duel',
    play: 'Сыграть со мной',
    body: (o, me, opp, name) =>
      `${o === 'win' ? '🏆 Победа' : o === 'loss' ? '😤 Поражение' : '🤝 Ничья'} <b>${ru(me)} : ${ru(opp)}</b> в Quiz Duel${name ? `\nСоперник: ${esc(name)}` : ''}\n\nВикторина 1 на 1: 10 вопросов, 15 секунд на каждый. Сыграем?`,
  },
  en: {
    title: 'My Quiz Duel result',
    play: 'Play with me',
    body: (o, me, opp, name) =>
      `${o === 'win' ? '🏆 Victory' : o === 'loss' ? '😤 Defeat' : '🤝 Draw'} <b>${en(me)} : ${en(opp)}</b> in Quiz Duel${name ? `\nOpponent: ${esc(name)}` : ''}\n\nA 1v1 quiz: 10 questions, 15 seconds each. Up for a game?`,
  },
};
