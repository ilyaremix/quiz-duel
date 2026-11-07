/**
 * Обновление 2.0: друзья, заявки, недавние соперники и приглашения по ссылке (startapp=r_<id>).
 * Дружба - две строки accepted (по одной на каждого), заявка - одна строка pending от того, кто позвал.
 * Звать в друзья можно только тех, с кем уже играли (или кто пришёл по вашей ссылке) - без спама.
 */
import { isGlow, type FriendStatus, type FriendView, type FriendsResponse, type PlayerBrief } from '@quiz-duel/shared';
import type { PrismaClient } from './generated/prisma/client.js';

export type Presence = (userId: number) => FriendStatus;

export type FriendRequestResult = 'sent' | 'accepted' | 'already' | 'not_allowed' | 'not_found';

export interface FriendsRepo {
  /** Первый вход в приложение: откуда пришёл (start_param) и кто пригласил. */
  attribute(userId: number, startParam: string | null): Promise<{ inviterId: number | null }>;
  list(userId: number, presence: Presence): Promise<FriendsResponse>;
  request(userId: number, targetId: number): Promise<FriendRequestResult>;
  /** Ответ на заявку; false - заявки не было. */
  respond(userId: number, fromId: number, accept: boolean): Promise<boolean>;
  remove(userId: number, friendId: number): Promise<void>;
  isFriend(a: number, b: number): Promise<boolean>;
  brief(userId: number): Promise<PlayerBrief | null>;
}

const BRIEF = { id: true, firstName: true, username: true, photoUrl: true, rating: true, glow: true, lastSeenAt: true } as const;

type BriefRow = { id: bigint; firstName: string; username: string | null; photoUrl: string | null; rating: number; glow: string; lastSeenAt: Date };

const toBrief = (u: BriefRow): PlayerBrief => ({
  id: Number(u.id),
  name: u.firstName,
  username: u.username,
  photoUrl: u.photoUrl,
  rating: u.rating,
  glow: isGlow(u.glow) ? u.glow : 'none',
});

/** Откуда пришёл: src_<код>, r_<id>, g_<партия> или organic. Храним коротко, без мусора. */
export function sourceOf(startParam: string | null): string {
  if (!startParam) return 'organic';
  const clean = startParam.slice(0, 64);
  return /^[A-Za-z0-9_-]+$/.test(clean) ? clean : 'organic';
}

export function referrerOf(startParam: string | null): number | null {
  const m = /^r_([1-9]\d{0,15})$/.exec(startParam ?? '');
  return m ? Number(m[1]) : null;
}

export function createPrismaFriendsRepo(prisma: PrismaClient): FriendsRepo {
  const view = (u: BriefRow, presence: Presence, at: Date | null, sent?: boolean): FriendView => ({
    player: toBrief(u),
    status: presence(Number(u.id)),
    lastSeenAt: u.lastSeenAt.getTime(),
    at: at ? at.getTime() : null,
    ...(sent === undefined ? {} : { sent }),
  });

  async function playedTogether(a: number, b: number) {
    const game = await prisma.game.findFirst({
      where: {
        mode: { not: 'solo' },
        OR: [
          { creatorId: BigInt(a), opponentId: BigInt(b) },
          { creatorId: BigInt(b), opponentId: BigInt(a) },
        ],
      },
      select: { id: true },
    });
    return Boolean(game);
  }

  async function befriend(a: number, b: number, via: string) {
    await prisma.$transaction([
      prisma.friend.upsert({
        where: { userId_friendId: { userId: BigInt(a), friendId: BigInt(b) } },
        create: { userId: BigInt(a), friendId: BigInt(b), status: 'accepted', via },
        update: { status: 'accepted' },
      }),
      prisma.friend.upsert({
        where: { userId_friendId: { userId: BigInt(b), friendId: BigInt(a) } },
        create: { userId: BigInt(b), friendId: BigInt(a), status: 'accepted', via },
        update: { status: 'accepted' },
      }),
    ]);
  }

  return {
    async attribute(userId, startParam) {
      // source заполняется один раз - при первом входе после обновления (у старых игроков - legacy).
      const source = sourceOf(startParam);
      const inviter = referrerOf(startParam);
      const validInviter =
        inviter !== null && inviter !== userId && (await prisma.user.count({ where: { id: BigInt(inviter) } })) > 0 ? inviter : null;
      const done = await prisma.user.updateMany({
        where: { id: BigInt(userId), source: null },
        data: { source, ...(validInviter ? { referrerId: BigInt(validInviter) } : {}) },
      });
      if (done.count === 0 || !validInviter) return { inviterId: null };
      await befriend(userId, validInviter, 'ref');
      return { inviterId: validInviter };
    },

    async list(userId, presence) {
      const me = BigInt(userId);
      const [rows, incoming, outgoing, recentGames, invited, earned] = await Promise.all([
        prisma.friend.findMany({ where: { userId: me, status: 'accepted' }, include: { friend: { select: BRIEF } } }),
        prisma.friend.findMany({ where: { friendId: me, status: 'pending' }, include: { user: { select: BRIEF } }, orderBy: { createdAt: 'desc' } }),
        prisma.friend.findMany({ where: { userId: me, status: 'pending' }, select: { friendId: true } }),
        prisma.$queryRaw<{ other: bigint; at: Date }[]>`
          SELECT CASE WHEN creator_id = ${me} THEN opponent_id ELSE creator_id END AS other, MAX(finished_at) AS at
          FROM games
          WHERE (creator_id = ${me} OR opponent_id = ${me}) AND opponent_id IS NOT NULL AND mode <> 'solo' AND finished_at IS NOT NULL
          GROUP BY other ORDER BY at DESC LIMIT 20`,
        prisma.user.count({ where: { referrerId: me, refRewarded: true } }),
        prisma.coinTx.aggregate({ where: { userId: me, reason: 'invite' }, _sum: { delta: true } }),
      ]);
      const friendIds = new Set(rows.map((r) => Number(r.friendId)));
      const incomingIds = new Set(incoming.map((r) => Number(r.userId)));
      const sentIds = new Set(outgoing.map((r) => Number(r.friendId)));
      const recentIds = recentGames.map((r) => Number(r.other)).filter((id) => !friendIds.has(id) && !incomingIds.has(id)).slice(0, 10);
      const recentUsers = recentIds.length
        ? await prisma.user.findMany({ where: { id: { in: recentIds.map((id) => BigInt(id)) } }, select: BRIEF })
        : [];
      const rank = (s: FriendStatus) => (s === 'online' ? 0 : s === 'ingame' ? 1 : 2);
      const friends = rows
        .map((r) => view(r.friend, presence, null))
        .sort((a, b) => rank(a.status) - rank(b.status) || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
      return {
        friends,
        incoming: incoming.map((r) => view(r.user, presence, r.createdAt)),
        recent: recentIds
          .map((id) => {
            const u = recentUsers.find((x) => Number(x.id) === id);
            const at = recentGames.find((g) => Number(g.other) === id)?.at ?? null;
            return u ? view(u, presence, at, sentIds.has(id)) : null;
          })
          .filter((v): v is FriendView => v !== null),
        ref: { invited, earned: earned._sum.delta ?? 0 },
      };
    },

    async request(userId, targetId) {
      if (userId === targetId) return 'not_allowed';
      const target = await prisma.user.findUnique({ where: { id: BigInt(targetId) }, select: { id: true } });
      if (!target) return 'not_found';
      if (!(await playedTogether(userId, targetId))) {
        const mine = await prisma.friend.findUnique({ where: { userId_friendId: { userId: BigInt(userId), friendId: BigInt(targetId) } } });
        if (mine?.status === 'accepted') return 'already';
        return 'not_allowed';
      }
      // Заявки одной пары - строго по очереди (блокировка на пару до конца транзакции): если оба
      // нажали «Добавить» одновременно, второй увидит заявку первого, и это сразу дружба,
      // а не две встречные заявки, которые висят у обоих.
      const [lo, hi] = userId < targetId ? [userId, targetId] : [targetId, userId];
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`friend:${lo}:${hi}`}))`;
        const key = (a: number, b: number) => ({ userId_friendId: { userId: BigInt(a), friendId: BigInt(b) } });
        const mine = await tx.friend.findUnique({ where: key(userId, targetId) });
        if (mine?.status === 'accepted') return 'already' as const;
        // Он уже звал меня - встречная заявка и есть согласие.
        const theirs = await tx.friend.findUnique({ where: key(targetId, userId) });
        if (theirs?.status === 'pending' || theirs?.status === 'accepted') {
          const via = theirs.via;
          await tx.friend.upsert({ where: key(userId, targetId), create: { userId: BigInt(userId), friendId: BigInt(targetId), status: 'accepted', via }, update: { status: 'accepted' } });
          await tx.friend.upsert({ where: key(targetId, userId), create: { userId: BigInt(targetId), friendId: BigInt(userId), status: 'accepted', via }, update: { status: 'accepted' } });
          return 'accepted' as const;
        }
        if (mine?.status === 'pending') return 'sent' as const;
        await tx.friend.create({ data: { userId: BigInt(userId), friendId: BigInt(targetId), status: 'pending', via: 'request' } });
        return 'sent' as const;
      });
    },

    async respond(userId, fromId, accept) {
      const pending = await prisma.friend.findUnique({ where: { userId_friendId: { userId: BigInt(fromId), friendId: BigInt(userId) } } });
      if (pending?.status !== 'pending') return false;
      if (accept) await befriend(userId, fromId, pending.via);
      else await prisma.friend.delete({ where: { userId_friendId: { userId: BigInt(fromId), friendId: BigInt(userId) } } });
      return true;
    },

    async remove(userId, friendId) {
      await prisma.friend.deleteMany({
        where: {
          OR: [
            { userId: BigInt(userId), friendId: BigInt(friendId) },
            { userId: BigInt(friendId), friendId: BigInt(userId) },
          ],
        },
      });
    },

    async isFriend(a, b) {
      const row = await prisma.friend.findUnique({ where: { userId_friendId: { userId: BigInt(a), friendId: BigInt(b) } } });
      return row?.status === 'accepted';
    },

    async brief(userId) {
      const u = await prisma.user.findUnique({ where: { id: BigInt(userId) }, select: BRIEF });
      return u ? toBrief(u) : null;
    },
  };
}
