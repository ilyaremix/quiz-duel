/**
 * Обновление 2.0: аналитика для админки. Всё считается SQL-запросами по своим таблицам:
 * user_days (кто когда открывал приложение), events (экраны и кнопки), users.source (откуда пришёл),
 * games, purchases, ad_views, coin_ledger. Дни - по Москве, как у серии входа.
 */
import {
  DAY_OFFSET_MS,
  dayKey,
  isGlow,
  eventKind,
  type AdminEvents,
  type AdminMoney,
  type AdminOverview,
  type AdminPeriod,
  type AdminPlayer,
  type AdminPlayerRow,
  type AdminRetention,
  type AdminSource,
  type AdminTask,
  type AdminTaskSaveRequest,
  type Delta,
  type SeriesPoint,
  type StarsProduct,
  type TaskConfigView,
  type Variant,
} from '@quiz-duel/shared';
import type { PrismaClient } from './generated/prisma/client.js';
import type { ChannelChecker, EconomyRepo } from './economy.js';

const DAY = 86_400_000;

export interface AdminDeps {
  prisma: PrismaClient;
  economy: EconomyRepo;
  /** Бот - админ канала (иначе подписку не проверить). */
  channels?: Pick<ChannelChecker, 'botIsAdmin'>;
  live: () => { online: number; inGame: number };
  botUsername: string;
  appUrl: string;
}

/** День по Москве как дата без времени (как в user_days.day). */
export const dayDate = (ms: number) => new Date(`${dayKey(ms)}T00:00:00Z`);

const label = (d: Date) => `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Изменение в процентах к прошлому периоду. */
function delta(now: number, before: number): Delta {
  if (!before) return null;
  return Math.round(((now - before) / before) * 1000) / 10;
}

const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
const num = (v: unknown) => Number(v ?? 0);

export function createAdminRepo({ prisma, economy, channels, live, botUsername, appUrl }: AdminDeps) {
  /** Начало периода: полночь по Москве days дней назад (включая сегодня). */
  const since = (now: number, days: number, shift = 0) => new Date(dayDate(now - (days - 1 + shift) * DAY).getTime() - DAY_OFFSET_MS);
  const appLink = `https://t.me/${botUsername}/${appUrl.split('/').pop()}`;

  async function dauSeries(now: number, days: AdminPeriod): Promise<{ series: SeriesPoint[]; byDay: Map<string, number> }> {
    const from = dayDate(now - (days - 1) * DAY);
    const rows = await prisma.$queryRaw<{ day: Date; n: bigint }[]>`
      SELECT day, COUNT(*)::bigint AS n FROM user_days WHERE day >= ${from} GROUP BY day ORDER BY day`;
    const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), num(r.n)]));
    return { series: fill(now, days, byDay), byDay };
  }

  /** Ряд по дням; за 90 дней - по неделям, в среднем за день. */
  function fill(now: number, days: AdminPeriod, byDay: Map<string, number>, average = true): SeriesPoint[] {
    const points: SeriesPoint[] = [];
    for (let k = days - 1; k >= 0; k--) {
      const d = dayDate(now - k * DAY);
      points.push({ d: label(d), v: byDay.get(d.toISOString().slice(0, 10)) ?? 0 });
    }
    if (days !== 90) return points;
    const weeks: SeriesPoint[] = [];
    for (let i = 0; i < points.length; i += 7) {
      const chunk = points.slice(i, i + 7);
      const sum = chunk.reduce((a, p) => a + p.v, 0);
      weeks.push({ d: chunk[0]!.d, v: average ? Math.round(sum / chunk.length) : sum });
    }
    return weeks;
  }

  async function countBetween(table: 'users' | 'games', from: Date, to: Date) {
    if (table === 'users') return prisma.user.count({ where: { createdAt: { gte: from, lt: to } } });
    return prisma.game.count({ where: { finishedAt: { gte: from, lt: to }, phase: 'finished' } });
  }

  async function distinctActive(from: Date, to: Date) {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT user_id)::bigint AS n FROM user_days WHERE day >= ${from} AND day < ${to}`;
    return num(rows[0]?.n);
  }

  async function avgDau(from: Date, to: Date, days: number) {
    const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(*)::bigint AS n FROM user_days WHERE day >= ${from} AND day < ${to}`;
    return Math.round(num(rows[0]?.n) / days);
  }

  /** Доля новичков периода, вернувшихся ровно на день N после первого входа (только кому уже N дней). */
  async function returnedOn(n: number, from: Date, now: number) {
    const cutoff = new Date(dayDate(now - n * DAY).getTime() - DAY_OFFSET_MS + DAY);
    const rows = await prisma.$queryRaw<{ total: bigint; back: bigint }[]>`
      WITH c AS (
        SELECT id, (created_at + interval '3 hours')::date AS d0 FROM users
        WHERE created_at >= ${from} AND created_at < ${cutoff} AND source IS DISTINCT FROM 'legacy'
      )
      SELECT COUNT(*)::bigint AS total,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_days ud WHERE ud.user_id = c.id AND ud.day = c.d0 + ${n}::int))::bigint AS back
      FROM c`;
    return pct(num(rows[0]?.back), num(rows[0]?.total));
  }

  return {
    /** Игрок открыл приложение: день активности (один раз в сутки). */
    async touchDay(userId: number, now: number) {
      await prisma.userDay.upsert({
        where: { userId_day: { userId: BigInt(userId), day: dayDate(now) } },
        create: { userId: BigInt(userId), day: dayDate(now) },
        update: {},
      });
    },

    async track(userId: number, names: readonly string[], now: number) {
      await prisma.event.createMany({ data: names.map((name) => ({ userId: BigInt(userId), name, createdAt: new Date(now) })) });
    },

    async overview(days: AdminPeriod, now: number): Promise<AdminOverview> {
      const from = since(now, days);
      const prev = since(now, days, days);
      const end = new Date(now + 1);
      const [users, fresh, freshPrev, games, gamesPrev, dau, dauPrev, mau, mauPrev, modes, series, freshRows] = await Promise.all([
        prisma.user.count(),
        countBetween('users', from, end),
        countBetween('users', prev, from),
        countBetween('games', from, end),
        countBetween('games', prev, from),
        avgDau(dayDate(from.getTime() + DAY_OFFSET_MS), dayDate(now + DAY), days),
        avgDau(dayDate(prev.getTime() + DAY_OFFSET_MS), dayDate(from.getTime() + DAY_OFFSET_MS), days),
        distinctActive(dayDate(now - 29 * DAY), dayDate(now + DAY)),
        distinctActive(dayDate(now - 59 * DAY), dayDate(now - 29 * DAY)),
        prisma.$queryRaw<{ variant: string; n: bigint }[]>`
          SELECT variant, COUNT(*)::bigint AS n FROM games
          WHERE phase = 'finished' AND mode <> 'solo' AND finished_at >= ${from} GROUP BY variant`,
        dauSeries(now, days),
        prisma.$queryRaw<{ day: Date; n: bigint }[]>`
          SELECT (created_at + interval '3 hours')::date AS day, COUNT(*)::bigint AS n FROM users
          WHERE created_at >= ${from} GROUP BY 1 ORDER BY 1`,
      ]);
      const totalModes = modes.reduce((a, m) => a + num(m.n), 0);
      const sticky = mau ? Math.round((dau / mau) * 1000) / 10 : 0;
      const stickyPrev = mauPrev ? Math.round((dauPrev / mauPrev) * 1000) / 10 : 0;
      const freshByDay = new Map(freshRows.map((r) => [r.day.toISOString().slice(0, 10), num(r.n)]));
      const ids: Variant[] = ['classic', 'lives', 'sudden', 'final'];
      return {
        days,
        live: live(),
        kpi: {
          users,
          fresh,
          freshD: delta(fresh, freshPrev),
          dau,
          dauD: delta(dau, dauPrev),
          mau,
          mauD: delta(mau, mauPrev),
          sticky,
          stickyD: stickyPrev ? Math.round((sticky - stickyPrev) * 10) / 10 : null,
          games,
          gamesD: delta(games, gamesPrev),
        },
        dau: series.series,
        fresh: fill(now, days, freshByDay, true),
        modes: ids.map((id) => {
          const n = num(modes.find((m) => m.variant === id)?.n);
          return { id, n, p: totalModes ? Math.round((n / totalModes) * 1000) / 10 : 0 };
        }),
      };
    },

    async retention(now: number): Promise<AdminRetention> {
      const from = since(now, 90);
      const days = [1, 2, 3, 5, 7, 14, 21, 30];
      const curve = await Promise.all(days.map((d) => returnedOn(d, from, now)));
      const [d1, d7, d30] = [curve[0]!, curve[4]!, curve[7]!];
      // Возвращающиеся: активные за последние 7 дней, пришедшие раньше дня активности.
      const ret = await prisma.$queryRaw<{ total: bigint; old: bigint }[]>`
        SELECT COUNT(*)::bigint AS total,
               COUNT(*) FILTER (WHERE (u.created_at + interval '3 hours')::date < ud.day)::bigint AS old
        FROM user_days ud JOIN users u ON u.id = ud.user_id
        WHERE ud.day >= ${dayDate(now - 6 * DAY)}`;
      // Когорты: 6 последних недель по неделе первого входа.
      const cols = [1, 3, 7, 14, 30];
      const cohorts: AdminRetention['cohorts'] = [];
      for (let w = 5; w >= 0; w--) {
        const start = dayDate(now - (w * 7 + 6) * DAY);
        const stop = new Date(start.getTime() + 7 * DAY);
        const size = await prisma.$queryRaw<{ n: bigint }[]>`
          SELECT COUNT(*)::bigint AS n FROM users
          WHERE (created_at + interval '3 hours')::date >= ${start} AND (created_at + interval '3 hours')::date < ${stop}
            AND source IS DISTINCT FROM 'legacy'`;
        const n = num(size[0]?.n);
        const v: (number | null)[] = [];
        for (const c of cols) {
          // Последний день когорты ещё не дожил до дня N - клетка пустая.
          if (stop.getTime() - DAY + c * DAY > dayDate(now).getTime()) {
            v.push(null);
            continue;
          }
          const back = await prisma.$queryRaw<{ n: bigint }[]>`
            SELECT COUNT(*)::bigint AS n FROM users u
            WHERE (u.created_at + interval '3 hours')::date >= ${start} AND (u.created_at + interval '3 hours')::date < ${stop}
              AND u.source IS DISTINCT FROM 'legacy'
              AND EXISTS (SELECT 1 FROM user_days ud WHERE ud.user_id = u.id AND ud.day = (u.created_at + interval '3 hours')::date + ${c}::int)`;
          v.push(n ? Math.round((num(back[0]?.n) / n) * 100) : null);
        }
        cohorts.push({ w: label(start), n, v });
      }
      // Липкость по дням за 30 дней: DAU дня / MAU на этот день.
      const series = await dauSeries(now, 30);
      const sticky: SeriesPoint[] = [];
      for (const p of series.series) sticky.push({ d: p.d, v: 0 });
      const mau = await distinctActive(dayDate(now - 29 * DAY), dayDate(now + DAY));
      series.series.forEach((p, i) => (sticky[i]!.v = mau ? Math.round((p.v / mau) * 1000) / 10 : 0));
      return {
        d1,
        d7,
        d30,
        returning: pct(num(ret[0]?.old), num(ret[0]?.total)),
        curve: [[0, 100], ...days.map((d, i) => [d, curve[i] ?? null] as [number, number | null])],
        cohorts,
        cohortCols: cols.map((c) => `D${c}`),
        sticky,
      };
    },

    async events(days: AdminPeriod, now: number): Promise<AdminEvents> {
      const from = since(now, days);
      const [rows, funnel] = await Promise.all([
        prisma.$queryRaw<{ name: string; count: bigint; users: bigint }[]>`
          SELECT name, COUNT(*)::bigint AS count, COUNT(DISTINCT user_id)::bigint AS users FROM events
          WHERE created_at >= ${from} GROUP BY name ORDER BY count DESC`,
        prisma.$queryRaw<{ open: bigint; onboard: bigint; first: bigint; three: bigint; back: bigint }[]>`
          SELECT COUNT(*)::bigint AS open,
                 COUNT(*) FILTER (WHERE onboarded)::bigint AS onboard,
                 COUNT(*) FILTER (WHERE games >= 1 OR EXISTS (SELECT 1 FROM solo_runs s WHERE s.user_id = u.id))::bigint AS first,
                 COUNT(*) FILTER (WHERE games >= 3)::bigint AS three,
                 COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM user_days ud WHERE ud.user_id = u.id AND ud.day = (u.created_at + interval '3 hours')::date + 1))::bigint AS back
          FROM users u WHERE created_at >= ${from} AND source IS DISTINCT FROM 'legacy'`,
      ]);
      const f = funnel[0];
      return {
        funnel: (['open', 'onboard', 'first', 'three', 'back'] as const).map((step) => ({ step, n: num(f?.[step]) })),
        events: rows.map((r) => ({ name: r.name, kind: eventKind(r.name), count: num(r.count), users: num(r.users) })),
      };
    },

    async sources(days: AdminPeriod, now: number) {
      const from = since(now, days);
      const d7cut = new Date(dayDate(now - 7 * DAY).getTime() - DAY_OFFSET_MS + DAY);
      const rows = await prisma.$queryRaw<{ src: string; users: bigint; first: bigint; d7base: bigint; d7: bigint; stars: bigint }[]>`
        WITH u AS (
          SELECT id, games, created_at, (created_at + interval '3 hours')::date AS d0,
                 CASE WHEN source IS NULL OR source = 'organic' THEN 'organic'
                      WHEN source LIKE 'src\\_%' THEN substring(source from 5)
                      WHEN source LIKE 'r\\_%' THEN 'ref'
                      WHEN source LIKE 'g\\_%' THEN 'duel'
                      ELSE source END AS src
          FROM users WHERE created_at >= ${from} AND source IS DISTINCT FROM 'legacy'
        )
        SELECT src, COUNT(*)::bigint AS users,
               COUNT(*) FILTER (WHERE games >= 1)::bigint AS first,
               COUNT(*) FILTER (WHERE created_at < ${d7cut})::bigint AS d7base,
               COUNT(*) FILTER (WHERE created_at < ${d7cut} AND EXISTS (SELECT 1 FROM user_days ud WHERE ud.user_id = u.id AND ud.day = u.d0 + 7))::bigint AS d7,
               COALESCE((SELECT SUM(p.stars) FROM purchases p WHERE p.user_id IN (SELECT id FROM u u2 WHERE u2.src = u.src) AND p.refunded_at IS NULL), 0)::bigint AS stars
        FROM u GROUP BY src ORDER BY users DESC`;
      const links = await prisma.link.findMany({ orderBy: { createdAt: 'desc' } });
      const auto = new Set(['organic', 'ref', 'duel', 'inline']);
      const out: AdminSource[] = rows.map((r) => {
        const link = links.find((l) => l.code === r.src);
        return {
          id: r.src,
          title: link?.title ?? null,
          users: num(r.users),
          first: pct(num(r.first), num(r.users)),
          d7: pct(num(r.d7), num(r.d7base)),
          stars: num(r.stars),
          auto: auto.has(r.src),
          url: link ? `${appLink}?startapp=src_${link.code}` : null,
        };
      });
      // Ссылки без игроков за период тоже видны (их только что создали).
      for (const l of links) {
        if (!out.some((s) => s.id === l.code)) out.push({ id: l.code, title: l.title, users: 0, first: null, d7: null, stars: 0, auto: false, url: `${appLink}?startapp=src_${l.code}` });
      }
      const top = await prisma.$queryRaw<{ id: bigint; name: string; invited: bigint }[]>`
        SELECT r.id, r.first_name AS name, COUNT(*)::bigint AS invited FROM users u JOIN users r ON r.id = u.referrer_id
        WHERE u.ref_rewarded GROUP BY r.id, r.first_name ORDER BY invited DESC LIMIT 5`;
      return {
        sources: out,
        refTop: top.map((t) => ({ id: Number(t.id), name: t.name, invited: num(t.invited) })),
        botUsername,
        appUrl: appLink,
      };
    },

    async createLink(code: string, title: string) {
      await prisma.link.upsert({ where: { code }, create: { code, title }, update: { title } });
      return `${appLink}?startapp=src_${code}`;
    },

    async money(days: AdminPeriod, now: number): Promise<AdminMoney> {
      const from = since(now, days);
      const prev = since(now, days, days);
      const [cur, before, byDay, products, ads, coins, spend, active] = await Promise.all([
        prisma.$queryRaw<{ stars: bigint; buyers: bigint; adfree: bigint }[]>`
          SELECT COALESCE(SUM(stars), 0)::bigint AS stars, COUNT(DISTINCT user_id)::bigint AS buyers,
                 COUNT(*) FILTER (WHERE product = 'adfree')::bigint AS adfree
          FROM purchases WHERE created_at >= ${from} AND refunded_at IS NULL`,
        prisma.$queryRaw<{ stars: bigint; buyers: bigint }[]>`
          SELECT COALESCE(SUM(stars), 0)::bigint AS stars, COUNT(DISTINCT user_id)::bigint AS buyers
          FROM purchases WHERE created_at >= ${prev} AND created_at < ${from} AND refunded_at IS NULL`,
        prisma.$queryRaw<{ day: Date; n: bigint }[]>`
          SELECT (created_at + interval '3 hours')::date AS day, SUM(stars)::bigint AS n FROM purchases
          WHERE created_at >= ${from} AND refunded_at IS NULL GROUP BY 1`,
        prisma.$queryRaw<{ product: string; count: bigint; stars: bigint }[]>`
          SELECT product, COUNT(*)::bigint AS count, SUM(stars)::bigint AS stars FROM purchases
          WHERE created_at >= ${from} AND refunded_at IS NULL GROUP BY product ORDER BY stars DESC`,
        prisma.$queryRaw<{ purpose: string; total: bigint; done: bigint }[]>`
          SELECT purpose, COUNT(*)::bigint AS total, COUNT(done_at)::bigint AS done FROM ad_views
          WHERE started_at >= ${from} GROUP BY purpose`,
        prisma.$queryRaw<{ earned: bigint; spent: bigint }[]>`
          SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0 AND reason <> 'stars'), 0)::bigint AS earned,
                 COALESCE(-SUM(delta) FILTER (WHERE delta < 0 AND reason = 'buy'), 0)::bigint AS spent
          FROM coin_ledger WHERE created_at >= ${from}`,
        prisma.$queryRaw<{ kind: string; n: bigint }[]>`
          SELECT split_part(ref, ':', 1) AS kind, -SUM(delta)::bigint AS n FROM coin_ledger
          WHERE created_at >= ${from} AND reason = 'buy' GROUP BY 1`,
        prisma.$queryRaw<{ n: bigint }[]>`SELECT COUNT(DISTINCT user_id)::bigint AS n FROM user_days WHERE day >= ${dayDate(from.getTime() + DAY_OFFSET_MS)}`,
      ]);
      const c = cur[0];
      const b = before[0];
      const stars = num(c?.stars);
      const buyers = num(c?.buyers);
      const ad = (p: string) => ads.find((a) => a.purpose === p);
      const forced = ad('forced');
      return {
        kpi: {
          stars,
          starsD: delta(stars, num(b?.stars)),
          buyers,
          buyersD: delta(buyers, num(b?.buyers)),
          arppu: buyers ? Math.round(stars / buyers) : 0,
          adFree: num(c?.adfree),
          activeBuyersShare: pct(buyers, num(active[0]?.n)),
        },
        stars: fill(now, days, new Map(byDay.map((r) => [r.day.toISOString().slice(0, 10), num(r.n)])), false),
        products: products.map((p) => ({ product: p.product as StarsProduct, count: num(p.count), stars: num(p.stars) })),
        ads: {
          forced: num(forced?.total),
          forcedDone: num(forced?.done),
          skipped: ads.reduce((a, r) => a + num(r.total) - num(r.done), 0),
          reward: num(ad('reward')?.done),
          topic: num(ad('topic')?.done),
        },
        coins: {
          earned: num(coins[0]?.earned),
          spent: num(coins[0]?.spent),
          spend: {
            topics: num(spend.find((s) => s.kind === 'topic')?.n),
            glow: num(spend.find((s) => s.kind === 'glow')?.n),
            packs: num(spend.find((s) => s.kind === 'pack')?.n),
          },
        },
      };
    },

    async tasks(): Promise<AdminTask[]> {
      const [configs, done] = await Promise.all([
        economy.taskConfigs(),
        prisma.$queryRaw<{ ref: string; n: bigint }[]>`
          SELECT ref, COUNT(*)::bigint AS n FROM coin_ledger WHERE reason IN ('task', 'ad', 'invite') GROUP BY ref`,
      ]);
      return Promise.all(
        configs.map(async (t) => ({
          ...t,
          done: num(done.find((d) => d.ref === t.id)?.n) + (t.type === 'invite' ? await prisma.user.count({ where: { refRewarded: true } }) : 0),
          botAdmin: t.type === 'channel' && t.channel && channels ? await channels.botIsAdmin(t.channel) : null,
        })),
      );
    },

    async saveTask(input: AdminTaskSaveRequest): Promise<TaskConfigView> {
      const freq = input.type === 'channel' || input.type === 'story' ? 'once' : input.type === 'invite' ? 'perFriend' : 'daily';
      const data = {
        type: input.type,
        channel: input.type === 'channel' ? input.channel : null,
        goal: input.type === 'play' || input.type === 'ads' ? input.goal : 1,
        reward: input.reward,
        freq,
        on: input.on,
        titleRu: input.titleRu,
        titleEn: input.titleEn,
      };
      const id = input.id ?? `${input.type}-${Date.now().toString(36)}`;
      const row = await prisma.taskConfig.upsert({
        where: { id },
        create: { id, ...data, sort: input.sort ?? 100 },
        update: { ...data, ...(input.sort === undefined ? {} : { sort: input.sort }) },
      });
      return (await economy.taskConfigs()).find((t) => t.id === row.id)!;
    },

    /** «Проверить» в листе задания. null - бота нет (локальный стенд без токена). */
    async checkChannel(channel: string): Promise<boolean | null> {
      return channels ? channels.botIsAdmin(channel) : null;
    },

    async removeTask(id: string) {
      await prisma.taskConfig.deleteMany({ where: { id } });
    },

    async players(query: string, filter: 'all' | 'new' | 'paying' | 'banned', now: number): Promise<AdminPlayerRow[]> {
      const q = query.trim().replace(/^@/, '');
      const id = /^\d{1,16}$/.test(q) ? BigInt(q) : null;
      const where = {
        ...(q ? { OR: [...(id ? [{ id }] : []), { firstName: { contains: q, mode: 'insensitive' as const } }, { username: { contains: q, mode: 'insensitive' as const } }] } : {}),
        ...(filter === 'new' ? { createdAt: { gte: new Date(now - 7 * DAY) } } : {}),
        ...(filter === 'banned' ? { banned: true } : {}),
        ...(filter === 'paying' ? { purchases: { some: { refundedAt: null } } } : {}),
      };
      const rows = await prisma.user.findMany({ where, orderBy: { lastSeenAt: 'desc' }, take: 50, include: { purchases: { where: { refundedAt: null }, select: { stars: true } } } });
      return rows.map((u) => ({
        id: Number(u.id),
        name: u.firstName,
        username: u.username,
        photoUrl: u.photoUrl,
        glow: isGlow(u.glow) ? u.glow : 'none',
        rating: u.rating,
        games: u.games,
        coins: u.coins,
        stars: u.purchases.reduce((a, p) => a + p.stars, 0),
        banned: u.banned,
        createdAt: u.createdAt.getTime(),
        lastSeenAt: u.lastSeenAt.getTime(),
      }));
    },

    async player(userId: number): Promise<AdminPlayer | null> {
      const u = await prisma.user.findUnique({ where: { id: BigInt(userId) }, include: { purchases: { orderBy: { createdAt: 'desc' }, take: 20 } } });
      if (!u) return null;
      return {
        id: Number(u.id),
        name: u.firstName,
        username: u.username,
        photoUrl: u.photoUrl,
        glow: isGlow(u.glow) ? u.glow : 'none',
        rating: u.rating,
        games: u.games,
        wins: u.wins,
        coins: u.coins,
        stars: u.purchases.filter((p) => !p.refundedAt).reduce((a, p) => a + p.stars, 0),
        banned: u.banned,
        createdAt: u.createdAt.getTime(),
        lastSeenAt: u.lastSeenAt.getTime(),
        source: u.source,
        purchases: u.purchases.map((p) => ({ product: p.product as StarsProduct, stars: p.stars, at: p.createdAt.getTime(), refunded: Boolean(p.refundedAt) })),
      };
    },

    /** Изменить баланс игрока (строка «admin» в журнале монет; в минус не уводит). */
    async adjustCoins(userId: number, delta: number, adminId: number, now: number) {
      return prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${BigInt(userId)} FOR UPDATE`;
        const u = await tx.user.findUnique({ where: { id: BigInt(userId) }, select: { coins: true } });
        if (!u) return null;
        const change = Math.max(-u.coins, delta);
        const row = await tx.user.update({ where: { id: BigInt(userId) }, data: { coins: { increment: change } }, select: { coins: true } });
        await tx.coinTx.create({ data: { userId: BigInt(userId), delta: change, balance: row.coins, reason: 'admin', ref: String(adminId), createdAt: new Date(now) } });
        return row.coins;
      });
    },

    async setBanned(userId: number, banned: boolean) {
      const done = await prisma.user.updateMany({ where: { id: BigInt(userId) }, data: { banned } });
      return done.count > 0;
    },

    async isBanned(userId: number) {
      const u = await prisma.user.findUnique({ where: { id: BigInt(userId) }, select: { banned: true } });
      return Boolean(u?.banned);
    },
  };
}

export type AdminRepo = ReturnType<typeof createAdminRepo>;
