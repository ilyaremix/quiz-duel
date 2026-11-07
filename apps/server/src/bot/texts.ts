import type { GameCategory, GameRules, Lang, Variant } from '@quiz-duel/shared';
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

/** Команды /paysupport (помощь с оплатой звёздами - её требует Telegram) и /terms. */
export const supportTexts: Record<Lang, { pay: string; payCommand: string; terms: string; termsCommand: string; termsButton: string; privacyButton: string }> = {
  ru: {
    pay:
      '💳 Помощь с оплатой\n\n' +
      'Если покупка за звёзды не пришла, списалась дважды или что-то пошло не так, напишите @ilyaremix. ' +
      'Укажите, что покупали и когда, и приложите ID операции: Telegram → Настройки → Мои звёзды → нужная покупка.\n\n' +
      'Отвечаем в течение 24 часов. Если товар не выдан, вернём звёзды.',
    payCommand: 'Помощь с оплатой',
    terms: 'Правила использования и Политика конфиденциальности Quiz Duel:',
    termsCommand: 'Правила и конфиденциальность',
    termsButton: 'Правила использования',
    privacyButton: 'Политика конфиденциальности',
  },
  en: {
    pay:
      '💳 Payment support\n\n' +
      'If a Stars purchase did not arrive, was charged twice or something else went wrong, message @ilyaremix. ' +
      'Tell us what you bought and when, and attach the transaction ID: Telegram → Settings → My Stars → the purchase.\n\n' +
      'We reply within 24 hours. If the item was not delivered, we refund the Stars.',
    payCommand: 'Payment support',
    terms: 'Quiz Duel Terms of Use and Privacy Policy:',
    termsCommand: 'Terms and privacy',
    termsButton: 'Terms of Use',
    privacyButton: 'Privacy Policy',
  },
};

/** Карточка «Вызов на дуэль» для shareMessage. Язык - создателя игры. */
export const inviteTexts: Record<
  Lang,
  {
    title: string;
    description: string;
    body: (name: string, category: string, rules: GameRules) => string;
    accept: string;
    categories: Record<GameCategory, string>;
    modes: Record<Variant, string>;
    /** «Микс · Классика · 10 вопросов по 15 секунд» */
    rules: (category: string, rules: GameRules) => string;
    /** Inline-режим: кнопка над результатами, когда карточку дать нельзя. */
    inlineConsent: string;
    inlineBusy: string;
    inlineOpen: string;
  }
> = {
  ru: {
    title: 'Вызов на дуэль',
    description: 'Викторина 1 на 1 - кто первым примет, тот и соперник',
    body(name, category, rules) {
      return (
        `⚔️ <b>${name ? `${name} вызывает вас` : 'Вас вызывают'} на дуэль в Quiz Duel!</b>\n${this.rules(category, rules)}\n\n` +
        'Кто первым нажмёт «Принять», тот и соперник.'
      );
    },
    rules: (category, r) => `${category} · ${inviteTexts.ru.modes[r.variant]} · ${r.count} ${ruPlural(r.count, 'вопрос', 'вопроса', 'вопросов')} по ${r.timeSec} ${ruPlural(r.timeSec, 'секунде', 'секунды', 'секунд')}`,
    modes: { classic: 'Классика', lives: 'Три жизни', sudden: 'Внезапная смерть', final: 'Финал ×2' },
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
      games: 'Видеоигры',
      space: 'Космос',
      food: 'Еда и кухни мира',
      crypto: 'Крипта и Web3',
    },
  },
  en: {
    title: 'Duel challenge',
    description: 'A 1v1 quiz - whoever accepts first is the opponent',
    body(name, category, rules) {
      return `⚔️ <b>${name ? `${name} challenges you` : 'You are challenged'} to a duel in Quiz Duel!</b>\n${this.rules(category, rules)}\n\nWhoever taps “Accept” first is the opponent.`;
    },
    rules: (category, r) => `${category} · ${inviteTexts.en.modes[r.variant]} · ${r.count} questions, ${r.timeSec} seconds each`,
    modes: { classic: 'Classic', lives: 'Three Lives', sudden: 'Sudden Death', final: 'Final ×2' },
    accept: 'Accept',
    inlineConsent: 'Open Quiz Duel and accept the documents',
    inlineBusy: 'You have a game in progress - go back',
    inlineOpen: 'Open Quiz Duel',
    categories: {
      mix: 'Mix',
      science: 'Science & Nature',
      history: 'History & Geography',
      culture: 'Film, Music & Books',
      games: 'Video Games',
      space: 'Space',
      food: 'Food & Cuisine',
      crypto: 'Crypto & Web3',
      sport: 'Sports',
      tech: 'Tech & Internet',
    },
  },
};

const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 1 вопрос, 2 вопроса, 5 вопросов. */
function ruPlural(n: number, one: string, few: string, many: string) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
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
        case 'friendInvite': {
          const what = a.category && a.rules ? `: ${inviteTexts.ru.rules(inviteTexts.ru.categories[a.category], a.rules)}` : '!';
          return { text: `⚔️ ${opp} зовёт вас на дуэль${what}\nВызов действует 15 минут.`, button: 'Принять вызов' };
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
        case 'friendInvite': {
          const what = a.category && a.rules ? `: ${inviteTexts.en.rules(inviteTexts.en.categories[a.category], a.rules)}` : '!';
          return { text: `⚔️ ${opp} challenges you to a duel${what}\nThe challenge is open for 15 minutes.`, button: 'Accept the challenge' };
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
      `${o === 'win' ? '🏆 Победа' : o === 'loss' ? '😤 Поражение' : '🤝 Ничья'} <b>${ru(me)} : ${ru(opp)}</b> в Quiz Duel${name ? `\nСоперник: ${esc(name)}` : ''}\n\nВикторина 1 на 1 прямо в Telegram. Сыграем?`,
  },
  en: {
    title: 'My Quiz Duel result',
    play: 'Play with me',
    body: (o, me, opp, name) =>
      `${o === 'win' ? '🏆 Victory' : o === 'loss' ? '😤 Defeat' : '🤝 Draw'} <b>${en(me)} : ${en(opp)}</b> in Quiz Duel${name ? `\nOpponent: ${esc(name)}` : ''}\n\nA 1v1 quiz right in Telegram. Up for a game?`,
  },
};

/** Напоминание о ежедневной награде: серия прервётся, если не зайти сегодня. */
export const dailyTexts: Record<Lang, { text: (day: number, reward: number) => string; button: string }> = {
  ru: {
    text: (day, reward) => `🎁 Ежедневная награда ждёт: день ${day}, +${ru(reward)} ${ruPlural(reward, 'монета', 'монеты', 'монет')}. Зайдите сегодня - серия не прервётся.`,
    button: 'Забрать',
  },
  en: {
    text: (day, reward) => `🎁 Your daily reward is waiting: day ${day}, +${en(reward)} coins. Check in today to keep your streak.`,
    button: 'Claim',
  },
};
