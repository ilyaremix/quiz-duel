/**
 * Шторки админки: задание, новая ссылка startapp, карточка игрока.
 * В шторках есть поля ввода, поэтому без свайпа вниз: листается содержимое, закрывают крестик,
 * тап по фону и системная «Назад».
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { RESERVED_SOURCES, TASK_TYPES, type AdminPeriod, type AdminPlayerRow, type AdminTask, type TaskType } from '@quiz-duel/shared';
import { api, ApiRequestError } from '../lib/api';
import { adminActions, adminKeys, useAdmin, type AdminSheet } from '../lib/admin';
import { pw, walletChanged } from '../lib/economy';
import { copyText, showToast } from '../lib/game';
import { haptic } from '../lib/telegram';
import { BotLine, seenText, useNum } from '../components/AdminCharts';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { Switch } from '../components/Switch';

const EXIT_MS = 240;
const CHANNEL = /^@[A-Za-z0-9_]{4,32}$/;
const CODE = /^[a-z0-9_]{2,24}$/;
const FREQ_OF: Record<TaskType, 'once' | 'daily' | 'perFriend'> = { channel: 'once', story: 'once', play: 'daily', ads: 'daily', invite: 'perFriend' };

function Frame({ open, label, onClose, children }: { open: boolean; label: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) {
      setMounted(true);
      setLeaving(false);
      return;
    }
    if (!mounted) return;
    setLeaving(true);
    const id = window.setTimeout(() => {
      setMounted(false);
      setLeaving(false);
    }, EXIT_MS);
    return () => window.clearTimeout(id);
  }, [open, mounted]);
  if (!mounted) return null;
  return (
    <div className="fixed inset-0 z-30">
      <div
        aria-hidden="true"
        className={`${leaving ? 'qd-backdrop-out' : 'qd-backdrop-in'} absolute inset-0`}
        style={{ background: 'var(--qd-scrim)' }}
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={`${leaving ? 'qd-sheet-out' : 'qd-sheet-in'} qd-sheet absolute inset-x-0 bottom-0 mx-auto box-border flex max-w-[560px] flex-col gap-3.5 overflow-y-auto overscroll-contain rounded-t-[32px] px-4 pt-2.5 text-text`}
        style={{
          maxHeight: 'calc(var(--tg-viewport-height, 100dvh) - var(--tg-viewport-safe-area-inset-top, 0px) - 24px)',
          paddingBottom: 'calc(var(--tg-viewport-safe-area-inset-bottom, 0px) + 28px)',
        }}
      >
        <div aria-hidden="true" className="qd-grab shrink-0" />
        <div className="flex shrink-0 items-center justify-between gap-3">
          <h2 className="m-0 min-w-0 truncate text-[22px] font-bold tracking-[-0.02em]">{label}</h2>
          <button type="button" className="qd-press qd-icon-btn" aria-label={t('common.close')} onClick={onClose} style={{ width: 44, height: 44 }}>
            <Icon glyph="close" size={18} stroke={2.5} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: ReactNode }) {
  return (
    <label className="flex shrink-0 flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-hint">{label}</span>
      {children}
      {(error || hint) && (
        <span className="mx-1 text-[12px] leading-[1.35] font-medium" style={{ color: error ? 'var(--qd-wrong-text)' : 'var(--tg-theme-hint-color)' }}>
          {error || hint}
        </span>
      )}
    </label>
  );
}

const INPUT = 'qd-glass qd-field box-border h-12 w-full min-w-0 rounded-[16px] border-0 px-3.5 text-[15px] font-semibold text-text';

function Stepper({
  label,
  text,
  onMinus,
  onPlus,
  canMinus,
  canPlus,
}: {
  label: string;
  text: string;
  onMinus: () => void;
  onPlus: () => void;
  canMinus: boolean;
  canPlus: boolean;
}) {
  const { t } = useTranslation();
  const btn = { width: 40, height: 40 };
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[12px] font-semibold text-hint">{label}</span>
      <div role="group" aria-label={label} className="qd-glass flex h-12 items-center justify-between rounded-[16px] px-1">
        <button
          type="button"
          className="qd-press qd-icon-btn disabled:opacity-40"
          aria-label={t('adm.task.minus')}
          onClick={onMinus}
          disabled={!canMinus}
          style={btn}
        >
          <Icon glyph="minus" size={18} stroke={2.6} />
        </button>
        <span className="qd-num text-[17px] font-bold" aria-live="polite">
          {text}
        </span>
        <button
          type="button"
          className="qd-press qd-icon-btn disabled:opacity-40"
          aria-label={t('adm.task.plus')}
          onClick={onPlus}
          disabled={!canPlus}
          style={btn}
        >
          <Icon glyph="plus" size={18} stroke={2.6} />
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Задание

function TaskForm({ task }: { task: AdminTask | null }) {
  const { t, i18n } = useTranslation();
  const num = useNum();
  const queryClient = useQueryClient();
  const isNew = !task;
  const [type, setType] = useState<TaskType>(task?.type ?? 'channel');
  const [channel, setChannel] = useState(task?.channel ?? '');
  const [titleRu, setTitleRu] = useState(task?.titleRu ?? '');
  const [titleEn, setTitleEn] = useState(task?.titleEn ?? '');
  const [reward, setReward] = useState(task?.reward ?? 100);
  const [goal, setGoal] = useState(task?.goal ?? 3);
  const [on, setOn] = useState(task?.on ?? true);
  const [bot, setBot] = useState<boolean | null | 'checking' | undefined>(task?.type === 'channel' ? task.botAdmin : undefined);
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const ch = channel.trim();
  const chError = type === 'channel' && (tried || ch.length > 1) && !CHANNEL.test(ch) ? t('adm.task.channelBad') : null;
  const hasGoal = type === 'play' || type === 'ads';
  const defaultTitle = (lang: 'ru' | 'en') => i18n.getFixedT(lang)(`s27.task.${type}.t`, { g: goal, games: pw(i18n.getFixedT(lang), goal, 'game') });

  const check = async () => {
    if (!CHANNEL.test(ch)) return setTried(true);
    setBot('checking');
    try {
      setBot((await api.admin.checkChannel(ch)).botAdmin);
    } catch {
      setBot(undefined);
      showToast('error', 'toast.connection');
    }
  };

  const save = async () => {
    setTried(true);
    if (type === 'channel' && !CHANNEL.test(ch)) return;
    setBusy(true);
    try {
      await api.admin.saveTask({
        ...(task ? { id: task.id } : {}),
        type,
        channel: type === 'channel' ? ch : null,
        goal: hasGoal ? goal : 1,
        reward,
        on,
        titleRu: titleRu.trim() || null,
        titleEn: titleEn.trim() || null,
      });
      await queryClient.invalidateQueries({ queryKey: adminKeys.tasks });
      walletChanged();
      haptic.success();
      adminActions.closeSheet();
      showToast('success', 'adm.task.saved', undefined, 'check');
    } catch {
      showToast('error', 'adm.task.saveError');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!task) return;
    setBusy(true);
    try {
      await api.admin.removeTask(task.id);
      await queryClient.invalidateQueries({ queryKey: adminKeys.tasks });
      walletChanged();
      adminActions.closeSheet();
      showToast('success', 'adm.task.removed', undefined, 'check');
    } catch {
      showToast('error', 'adm.task.saveError');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex shrink-0 flex-col gap-2">
        <span className="text-[12px] font-semibold text-hint">{t('adm.task.type')}</span>
        {isNew ? (
          <div role="radiogroup" aria-label={t('adm.task.type')} className="flex flex-wrap gap-1.5">
            {TASK_TYPES.map((x) => (
              <button
                key={x}
                type="button"
                role="radio"
                aria-checked={x === type}
                onClick={() => {
                  setType(x);
                  setGoal(x === 'ads' ? 5 : 3);
                  setBot(undefined);
                }}
                className={`qd-press qd-chip cursor-pointer border-0 font-bold ${x === type ? 'qd-chip-brand' : ''}`}
                style={{ height: 34, padding: '0 12px', fontSize: 13, fontFamily: 'inherit' }}
              >
                {t(`adm.tasks.types.${x}`)}
              </button>
            ))}
          </div>
        ) : (
          <span className="qd-chip qd-chip-brand self-start" style={{ height: 34, padding: '0 12px', fontSize: 13, fontWeight: 700 }}>
            {t(`adm.tasks.types.${type}`)}
          </span>
        )}
      </div>

      {type === 'channel' && (
        <div className="flex shrink-0 flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-hint">{t('adm.task.channel')}</span>
          <div className="flex items-center gap-2">
            <input
              className={INPUT}
              value={channel}
              onChange={(e) => {
                const v = e.target.value.replace(/\s/g, '');
                setChannel(v && !v.startsWith('@') ? `@${v}` : v);
                setBot(undefined);
              }}
              placeholder={t('adm.task.newCh')}
              aria-label={t('adm.task.channel')}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={33}
            />
            <button
              type="button"
              onClick={() => void check()}
              disabled={bot === 'checking'}
              className="qd-press qd-chip qd-chip-brand shrink-0 cursor-pointer border-0 font-bold disabled:opacity-60"
              style={{ height: 48, padding: '0 14px', fontSize: 14, borderRadius: 16, fontFamily: 'inherit' }}
            >
              {t('adm.task.check')}
            </button>
          </div>
          {chError ? (
            <span className="mx-1 text-[12px] font-medium" style={{ color: 'var(--qd-wrong-text)' }}>
              {chError}
            </span>
          ) : bot === 'checking' ? (
            <span role="status" className="mx-1 text-[12px] font-semibold text-hint">
              {t('adm.task.checking')}
            </span>
          ) : bot !== undefined ? (
            <span className="mx-1">
              <BotLine ok={bot} />
            </span>
          ) : null}
        </div>
      )}

      <Field label={t('adm.task.titleRu')} hint={t('adm.task.titleHint')}>
        <input className={INPUT} value={titleRu} onChange={(e) => setTitleRu(e.target.value)} placeholder={defaultTitle('ru')} maxLength={60} />
      </Field>
      <Field label={t('adm.task.titleEn')}>
        <input className={INPUT} value={titleEn} onChange={(e) => setTitleEn(e.target.value)} placeholder={defaultTitle('en')} maxLength={60} lang="en" />
      </Field>

      <div className="grid shrink-0 grid-cols-2 gap-2.5">
        <Stepper
          label={t('adm.task.reward')}
          text={`+${num(reward)}`}
          onMinus={() => setReward((r) => Math.max(10, r - 10))}
          onPlus={() => setReward((r) => Math.min(10_000, r + 10))}
          canMinus={reward > 10}
          canPlus={reward < 10_000}
        />
        {hasGoal && (
          <Stepper
            label={t('adm.task.goal')}
            text={num(goal)}
            onMinus={() => setGoal((g) => Math.max(1, g - 1))}
            onPlus={() => setGoal((g) => Math.min(20, g + 1))}
            canMinus={goal > 1}
            canPlus={goal < 20}
          />
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-0.5 px-1">
        <span className="text-[12px] font-semibold text-hint">{t('adm.task.freq')}</span>
        <span className="text-[15px] font-semibold">
          {t(`adm.tasks.freq.${FREQ_OF[type]}`)} <span className="text-[12px] font-medium text-hint">· {t('adm.task.freqFixed')}</span>
        </span>
      </div>

      <div className="qd-card flex shrink-0 items-center gap-3 rounded-[22px] py-1.5 pr-2 pl-4">
        <span className="grow text-[15px] font-semibold">{t('adm.task.on')}</span>
        <Switch on={on} label={t('adm.task.on')} onToggle={() => setOn((v) => !v)} />
      </div>

      <div className="flex shrink-0 flex-col gap-1">
        <Button onClick={() => void save()} disabled={busy} icon={<Icon glyph="check" size={22} stroke={2.4} />}>
          {t('adm.task.save')}
        </Button>
        {!isNew && (
          <Button variant="ghost" size="s" onClick={() => void remove()} disabled={busy}>
            {t('adm.task.remove')}
          </Button>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Ссылка startapp

function LinkForm({ days }: { days: AdminPeriod }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const sources = useQuery({ queryKey: adminKeys.sources(days), queryFn: () => api.admin.sources(days) });
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);

  const reserved = RESERVED_SOURCES.includes(code);
  const codeError = (tried || code.length >= 2) && !CODE.test(code) ? t('adm.link.bad') : reserved ? t('adm.link.reserved') : null;
  const titleError = tried && !title.trim() ? t('adm.link.noName') : null;
  const base = sources.data?.appUrl ?? '';
  const url = base ? `${base}?startapp=src_${code || t('adm.link.codeVal').replace(/^src_/, '')}` : '';
  const name = title.trim() || t('adm.link.nameVal');

  const create = async (close: boolean) => {
    setTried(true);
    if (!CODE.test(code) || reserved || !title.trim()) return;
    setBusy(true);
    try {
      const res = await api.admin.createLink(code, title.trim());
      await queryClient.invalidateQueries({ queryKey: ['admin', 'sources'] });
      try {
        await copyText(res.url);
        showToast('success', 'adm.link.copied', undefined, 'check');
      } catch {
        showToast('error', 'toast.error');
      }
      if (close) adminActions.closeSheet();
    } catch (error) {
      showToast('error', error instanceof ApiRequestError && error.status === 400 ? 'adm.link.bad' : 'toast.connection');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Field label={t('adm.link.name')} error={titleError}>
        <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('adm.link.nameVal')} maxLength={60} />
      </Field>
      <Field label={t('adm.link.code')} hint={t('adm.link.codeHint')} error={codeError}>
        <span className="qd-glass qd-field-wrap flex h-12 items-center rounded-[16px] px-3.5 font-mono text-[14px] font-semibold">
          <span aria-hidden="true" className="text-hint">
            src_
          </span>
          <input
            className="h-full min-w-0 grow border-0 bg-transparent p-0 font-mono text-[14px] font-semibold text-text outline-none"
            value={code}
            onChange={(e) =>
              setCode(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, '')
                  .slice(0, 24),
              )
            }
            placeholder={t('adm.link.codeVal').replace(/^src_/, '')}
            aria-label={t('adm.link.code')}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </span>
      </Field>
      <div className="flex shrink-0 flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-hint">{t('adm.link.url')}</span>
        <div
          className="qd-card-brand box-border min-h-12 rounded-[16px] px-3.5 py-3 font-mono text-[13px] leading-[1.4] font-semibold break-all"
          style={{ opacity: code ? 1 : 0.6 }}
        >
          {url || '…'}
        </div>
      </div>
      <p className="m-0 mx-1 shrink-0 text-[13px] leading-[1.45] font-medium text-hint">{t('adm.link.hint', { name })}</p>
      <div className="flex shrink-0 flex-col gap-2.5">
        <Button variant="secondary" size="m" onClick={() => void create(false)} disabled={busy} icon={<Icon glyph="copy" size={20} stroke={2.4} />}>
          {t('adm.link.copy')}
        </Button>
        <Button onClick={() => void create(true)} disabled={busy} icon={<Icon glyph="check" size={22} stroke={2.4} />}>
          {t('adm.link.done')}
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Игрок

const PRODUCT_KEY = { coins_s: 'coinsS', coins_m: 'coinsM', coins_l: 'coinsL', adfree: 'adFree' } as const;
const STEP = 100;

function PlayerForm({ row }: { row: AdminPlayerRow }) {
  const { t, i18n: tr } = useTranslation();
  const num = useNum();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: adminKeys.player(row.id), queryFn: () => api.admin.player(row.id) });
  const u = q.data ?? row;
  const [coins, setCoins] = useState<number | null>(null);
  const [banned, setBanned] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const target = coins ?? u.coins;
  const ban = banned ?? u.banned;
  const diff = target - u.coins;
  const lang = tr.language;
  const date = (ms: number) => new Intl.DateTimeFormat(lang, { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(ms));
  const source = q.data?.source ?? null;
  const sourceName =
    !source || source === 'organic'
      ? t('adm.src.names.organic')
      : source.startsWith('r_')
        ? t('adm.src.names.ref')
        : source.startsWith('g_')
          ? t('adm.src.names.duel')
          : source.replace(/^src_/, '');

  const save = async () => {
    setBusy(true);
    try {
      if (diff !== 0) await api.admin.coins(u.id, diff);
      if (ban !== u.banned) {
        try {
          await api.admin.ban(u.id, ban);
        } catch (error) {
          if (error instanceof ApiRequestError && error.status === 409) {
            showToast('error', 'adm.player.banAdmin');
            setBanned(null);
            await queryClient.invalidateQueries({ queryKey: adminKeys.player(u.id) });
            return;
          }
          throw error;
        }
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin', 'players'] }),
        queryClient.invalidateQueries({ queryKey: adminKeys.player(u.id) }),
      ]);
      haptic.success();
      adminActions.closeSheet();
      showToast('success', 'adm.player.saved', undefined, 'check');
    } catch {
      showToast('error', 'adm.task.saveError');
    } finally {
      setBusy(false);
    }
  };

  const stats: [string, string][] = [
    [t('adm.player.games'), num(u.games)],
    [t('adm.player.wins'), q.data ? num(q.data.wins) : '…'],
    [t('adm.player.rating'), num(u.rating)],
    [t('adm.player.source'), q.data ? sourceName : '…'],
    [t('adm.player.first'), date(u.createdAt)],
    [t('adm.player.last'), seenText(u.lastSeenAt, lang, t)],
  ];

  return (
    <>
      <div className="flex shrink-0 items-center gap-3.5">
        <Avatar id={u.id} name={u.name} photoUrl={u.photoUrl} size={56} on="none" glow={u.glow} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate text-[18px] font-bold">{u.name}</span>
          <span className="qd-num truncate text-[13px] font-medium text-hint">
            {[u.username ? `@${u.username}` : null, `${t('adm.player.id')} ${u.id}`].filter(Boolean).join(' · ')}
          </span>
        </div>
      </div>
      <div className="grid shrink-0 grid-cols-3 gap-2">
        {stats.map(([label, value]) => (
          <div key={label} className="qd-glass flex min-w-0 flex-col gap-px rounded-[16px] px-2.5 py-2">
            <span className="truncate text-[11px] font-semibold text-hint">{label}</span>
            <span className="qd-num truncate text-[14px] font-bold">{value}</span>
          </div>
        ))}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <Stepper
          label={t('adm.player.give')}
          text={num(target)}
          onMinus={() => setCoins(Math.max(0, target - STEP))}
          onPlus={() => setCoins(target + STEP)}
          canMinus={target > 0}
          canPlus={target < 10_000_000}
        />
        {diff !== 0 && (
          <span className="qd-num mx-1 text-[12px] font-medium text-hint">
            {t('adm.player.change', { was: num(u.coins), d: `${diff > 0 ? '+' : '−'}${num(Math.abs(diff))}` })}
          </span>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-hint">{t('adm.player.purchases')}</span>
        <div className="flex flex-wrap gap-1.5">
          {q.data?.purchases.length ? (
            q.data.purchases.map((p, i) => (
              <span
                key={i}
                className="qd-chip qd-chip-gold qd-num"
                style={{ opacity: p.refunded ? 0.5 : 1, textDecoration: p.refunded ? 'line-through' : 'none' }}
              >
                {`${t(`adm.money.products.${PRODUCT_KEY[p.product]}`)} · ${num(p.stars)} ⭐ · ${date(p.at)}`}
              </span>
            ))
          ) : (
            <span className="text-[13px] font-medium text-hint">{q.data ? t('adm.player.none') : '…'}</span>
          )}
        </div>
      </div>
      <div className="qd-card flex shrink-0 items-center gap-3 rounded-[22px] py-1.5 pr-2 pl-4">
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-[15px] font-semibold">{t('adm.player.ban')}</span>
          <span className="text-[12px] font-medium text-hint">{t('adm.player.banHint')}</span>
        </span>
        <Switch on={ban} label={t('adm.player.ban')} onToggle={() => setBanned(!ban)} />
      </div>
      <Button onClick={() => void save()} disabled={busy || (diff === 0 && ban === u.banned)} icon={<Icon glyph="check" size={22} stroke={2.4} />}>
        {t('adm.player.save')}
      </Button>
    </>
  );
}

// ---------------------------------------------------------------------------

function keyOf(sheet: NonNullable<AdminSheet>) {
  if (sheet.kind === 'task') return `task:${sheet.task?.id ?? 'new'}`;
  if (sheet.kind === 'player') return `player:${sheet.player.id}`;
  return 'link';
}

export function AdminSheets({ days }: { days: AdminPeriod }) {
  const { t } = useTranslation();
  const sheet = useAdmin((s) => s.sheet);
  // Пока шторка уезжает, в ней остаётся прежнее содержимое.
  const [last, setLast] = useState<AdminSheet>(sheet);
  useEffect(() => {
    if (sheet) setLast(sheet);
  }, [sheet]);
  const shown = sheet ?? last;
  const label = !shown
    ? ''
    : shown.kind === 'task'
      ? t(shown.task ? 'adm.task.title' : 'adm.task.newTitle')
      : shown.kind === 'link'
        ? t('adm.link.title')
        : shown.player.name;
  return (
    <Frame open={Boolean(sheet)} label={label} onClose={adminActions.closeSheet}>
      {shown?.kind === 'task' && <TaskForm key={keyOf(shown)} task={shown.task} />}
      {shown?.kind === 'link' && <LinkForm key={keyOf(shown)} days={days} />}
      {shown?.kind === 'player' && <PlayerForm key={keyOf(shown)} row={shown.player} />}
    </Frame>
  );
}
