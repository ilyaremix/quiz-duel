/**
 * Обновление 2.0: админка - 7 разделов (обзор, удержание, события, источники, деньги, задания, игроки).
 * Фильтр периода один, над всеми графиками раздела; в «Заданиях» и «Игроках» его нет.
 * Видят только админы: сервер отдаёт данные только ADMIN_IDS.
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { EVENT_NAMES, type AdminPeriod, type AdminTask, type MeResponse, type StarsProduct } from '@quiz-duel/shared';
import { api } from '../lib/api';
import { ADMIN_TABS, PERIODS, adminActions, adminKeys, useAdmin, type AdminTab } from '../lib/admin';
import { pw } from '../lib/economy';
import { copyText, showToast } from '../lib/game';
import { onBack } from '../lib/telegram';
import { Bars, BotLine, Kpi, Line, Meter, Panel, seenText, useNum } from '../components/AdminCharts';
import { Avatar } from '../components/Avatar';
import { Button } from '../components/Button';
import { Icon } from '../components/Icon';
import { MODE_LOOK } from '../components/Modes';
import { Segmented } from '../components/Segmented';
import { Switch } from '../components/Switch';
import { TASK_LOOK } from '../components/Shop';
import { AdminSheets } from './AdminSheets';

const HINT = 'var(--tg-theme-hint-color)';
const PRODUCT_KEY: Record<StarsProduct, string> = { coins_s: 'coinsS', coins_m: 'coinsM', coins_l: 'coinsL', adfree: 'adFree' };

/** Загрузка и ошибка раздела: пока данных нет - плитки-заглушки, ошибка - с кнопкой «Повторить». */
function Pending({ q, tiles = 4 }: { q: UseQueryResult<unknown>; tiles?: number }) {
  const { t } = useTranslation();
  if (q.isError) {
    return (
      <div className="qd-card flex flex-col items-center gap-3 rounded-[26px] px-4 py-6 text-center">
        <span className="text-[15px] font-semibold">{t('adm.loadError')}</span>
        <Button variant="secondary" size="s" full={false} icon={<Icon glyph="retry" size={18} stroke={2.4} />} onClick={() => void q.refetch()}>
          {t('adm.retry')}
        </Button>
      </div>
    );
  }
  return (
    <div aria-hidden="true" className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {Array.from({ length: tiles }, (_, i) => (
          <div key={i} className="qd-skel qd-glass h-24 rounded-[24px]" />
        ))}
      </div>
      <div className="qd-skel qd-glass h-[220px] rounded-[26px]" />
    </div>
  );
}

function Header({ tab, days }: { tab: AdminTab; days: AdminPeriod }) {
  const { t } = useTranslation();
  const num = useNum();
  const nav = useRef<HTMLElement | null>(null);
  // Выбранный раздел всегда виден в ряду вкладок (ряд листается вбок).
  useEffect(() => {
    nav.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [tab]);
  // «Онлайн» - из обзора за текущий период (обновляется раз в 30 с).
  const live = useQuery({ queryKey: adminKeys.overview(days), queryFn: () => api.admin.overview(days), refetchInterval: 30_000 }).data?.live;
  const labels = t('adm.period').split('|');
  // Удержание считается по своим окнам (D1/D7/D30, когорты), период на него не влияет.
  const showPeriod = tab !== 'retention' && tab !== 'tasks' && tab !== 'players';
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <button type="button" className="qd-press qd-icon-btn" aria-label={t('adm.close')} onClick={adminActions.close}>
          <Icon glyph="back" size={22} stroke={2.4} />
        </button>
        <div className="flex min-w-0 grow flex-col gap-px">
          <h1 className="m-0 text-[24px] font-bold tracking-[-0.02em]">{t('adm.title')}</h1>
          <span className="truncate text-[12px] font-medium text-hint">{t('adm.sub')}</span>
        </div>
        {live && (
          <span role="status" className="qd-chip qd-chip-ok qd-num shrink-0" style={{ height: 28, padding: '0 10px', gap: 6, fontSize: 12 }}>
            <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-current" />
            {t('adm.live', { n: num(live.online), g: num(live.inGame) })}
          </span>
        )}
      </div>
      <nav ref={nav} aria-label={t('adm.tabsAria')} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pt-0.5 pb-1" style={{ scrollbarWidth: 'none' }}>
        {ADMIN_TABS.map((id) => (
          <button
            key={id}
            type="button"
            aria-current={id === tab ? 'page' : undefined}
            onClick={() => adminActions.setTab(id)}
            className={`qd-press qd-chip shrink-0 cursor-pointer border-0 font-bold ${id === tab ? 'qd-chip-brand' : ''}`}
            style={{ height: 36, padding: '0 14px', fontSize: 14, fontFamily: 'inherit' }}
          >
            {t(`adm.tabs.${id}`)}
          </button>
        ))}
      </nav>
      {showPeriod && (
        <div className="flex flex-col gap-1.5">
          <Segmented
            label={t('adm.periodAria')}
            options={PERIODS.map((p, i) => ({ value: String(p) as '7' | '30' | '90', label: labels[i] ?? String(p) }))}
            value={String(days) as '7' | '30' | '90'}
            onPick={(v) => adminActions.setDays(Number(v) as AdminPeriod)}
          />
          <span className="mx-1.5 text-[12px] font-medium text-hint">{t('adm.vsPrev', { n: days })}</span>
        </div>
      )}
    </header>
  );
}

// ---------------------------------------------------------------------------
// Обзор

function OverviewTab({ days }: { days: AdminPeriod }) {
  const { t } = useTranslation();
  const num = useNum();
  const q = useQuery({ queryKey: adminKeys.overview(days), queryFn: () => api.admin.overview(days), refetchInterval: 30_000 });
  if (!q.data) return <Pending q={q} tiles={6} />;
  const K = q.data.kpi;
  const by = days === 90 ? t('adm.chart.weekly') : t('adm.chart.title');
  return (
    <>
      <section className="grid grid-cols-2 gap-2.5">
        <Kpi label={t('adm.kpi.users')} value={num(K.users)} sub={t('adm.kpi.usersSub', { n: num(K.fresh) })} />
        <Kpi label={t('adm.kpi.newUsers')} value={num(K.fresh)} delta={K.freshD} />
        <Kpi label={t('adm.kpi.dau')} value={num(K.dau)} delta={K.dauD} />
        <Kpi label={t('adm.kpi.mau')} value={num(K.mau)} delta={K.mauD} />
        <Kpi label={t('adm.kpi.sticky')} value={`${num(K.sticky)}%`} delta={K.stickyD} unit="pp" />
        <Kpi label={t('adm.kpi.games')} value={num(K.games)} delta={K.gamesD} />
      </section>
      <Panel title={t('adm.chart.active')} sub={by}>
        <Bars data={q.data.dau} label={t('adm.chart.active')} />
      </Panel>
      <Panel title={t('adm.chart.newbies')} sub={by}>
        <Bars data={q.data.fresh} label={t('adm.chart.newbies')} height={100} />
      </Panel>
      <Panel title={t('adm.modes')} sub={t('adm.modesSub')}>
        {q.data.modes.map((m) => (
          <Meter key={m.id} label={t(`s32.mode.${m.id}.t`)} value={`${num(m.n)} · ${num(m.p, 0)}%`} share={m.p / 100} look={MODE_LOOK[m.id]} />
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Удержание

function RetentionTab() {
  const { t } = useTranslation();
  const num = useNum();
  const q = useQuery({ queryKey: adminKeys.retention, queryFn: api.admin.retention });
  const [cell, setCell] = useState<[number, number] | null>(null);
  if (!q.data) return <Pending q={q} />;
  const D = q.data;
  const pct = (v: number | null) => (v === null ? '-' : `${num(v)}%`);
  const curve = D.curve.filter((c): c is [number, number] => c[1] !== null).map(([x, v]) => ({ x, d: t('adm.ret.day', { n: x }), v }));
  const sel = cell && D.cohorts[cell[0]] ? { c: D.cohorts[cell[0]]!, col: cell[1] } : null;
  const selV = sel ? (sel.c.v[sel.col] ?? null) : null;
  const note = !sel
    ? t('adm.ret.tapHint')
    : selV === null
      ? `${sel.c.w} · ${D.cohortCols[sel.col]}: ${t('adm.ret.empty')}`
      : t('adm.ret.cell', {
          w: sel.c.w,
          c: D.cohortCols[sel.col],
          v: `${selV}%`,
          n: num(Math.round((sel.c.n * selV) / 100)),
          players: pw(t, Math.round((sel.c.n * selV) / 100), 'player'),
        });
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: `48px 46px repeat(${D.cohortCols.length}, minmax(0, 1fr))`, gap: 4 };
  return (
    <>
      <section className="grid grid-cols-2 gap-2.5">
        <Kpi label={t('adm.kpi.d1')} value={pct(D.d1)} />
        <Kpi label={t('adm.kpi.d7')} value={pct(D.d7)} />
        <Kpi label={t('adm.kpi.d30')} value={pct(D.d30)} />
        <Kpi label={t('adm.kpi.returning')} value={pct(D.returning)} sub={t('adm.kpi.returningSub')} />
      </section>
      <Panel title={t('adm.ret.curve')} sub={t('adm.ret.curveSub')}>
        <Line data={curve} label={t('adm.ret.curve')} max={100} />
      </Panel>
      <Panel title={t('adm.ret.cohorts')} sub={t('adm.ret.cohortsSub')}>
        <div role="table" aria-label={t('adm.ret.cohorts')} className="flex flex-col gap-1">
          <div role="row" className="text-[11px] font-bold text-hint" style={grid}>
            <span role="columnheader">{t('adm.ret.week')}</span>
            <span role="columnheader">{t('adm.ret.size')}</span>
            {D.cohortCols.map((c) => (
              <span key={c} role="columnheader" className="text-center">
                {c}
              </span>
            ))}
          </div>
          {D.cohorts.map((c, ri) => (
            <div key={c.w} role="row" className="items-center" style={grid}>
              <span role="rowheader" className="qd-num text-[12px] font-bold">
                {c.w}
              </span>
              <span role="cell" className="qd-num text-[12px] font-semibold text-hint">
                {num(c.n)}
              </span>
              {c.v.map((v, ci) => {
                // Один тон: чем больше вернулось - тем плотнее; пустая клетка - день ещё не наступил.
                const a = v === null ? 0 : 0.12 + 0.8 * Math.min(1, v / 45);
                const on = cell?.[0] === ri && cell[1] === ci;
                return (
                  <button
                    key={ci}
                    type="button"
                    role="cell"
                    aria-label={`${c.w}, ${D.cohortCols[ci]}: ${v === null ? t('adm.ret.empty') : `${v}%`}`}
                    onClick={() => setCell([ri, ci])}
                    className="qd-num h-8 min-w-0 cursor-pointer rounded-[8px] border-0 p-0 text-[12px] font-bold"
                    style={{
                      background: v === null ? 'var(--qd-chart-track)' : `rgba(var(--qd-chart-rgb), ${a.toFixed(2)})`,
                      color: v === null ? HINT : a > 0.45 ? '#FFFFFF' : 'var(--tg-theme-text-color)',
                      boxShadow: on ? '0 0 0 2px var(--tg-theme-text-color)' : 'none',
                      fontFamily: 'inherit',
                    }}
                  >
                    {v === null ? '·' : `${v}%`}
                  </button>
                );
              })}
            </div>
          ))}
          <span role="status" className="mt-1.5 text-[12px] leading-[1.4] font-semibold">
            {note}
          </span>
        </div>
      </Panel>
      <Panel title={t('adm.ret.sticky')} sub={t('adm.ret.stickySub')}>
        <Line data={D.sticky.map((p) => ({ d: p.d, v: p.v }))} label={t('adm.ret.sticky')} height={100} />
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// События

function EventsTab({ days }: { days: AdminPeriod }) {
  const { t } = useTranslation();
  const num = useNum();
  const q = useQuery({ queryKey: adminKeys.events(days), queryFn: () => api.admin.events(days) });
  const [filter, setFilter] = useState<'all' | 'btn' | 'screen'>('all');
  if (!q.data) return <Pending q={q} tiles={0} />;
  const funnel = q.data.funnel;
  const base = funnel[0]?.n ?? 0;
  const list = q.data.events.filter((e) => filter === 'all' || e.kind === filter);
  const top = Math.max(1, ...list.map((e) => e.count));
  const [fAll, fBtn, fScreen] = t('adm.ev.filter').split('|');
  const known = (EVENT_NAMES.screen as readonly string[]).concat(EVENT_NAMES.btn);
  return (
    <>
      <Panel title={t('adm.ev.funnel')} sub={t('adm.ev.funnelSub')}>
        {funnel.map((s, i) => {
          const share = base ? s.n / base : 0;
          const prev = funnel[i - 1]?.n ?? 0;
          return (
            <Meter
              key={s.step}
              label={t(`adm.ev.steps.${s.step}`)}
              value={`${num(s.n)} · ${base ? Math.round(share * 100) : 0}%`}
              share={share}
              sub={i ? t('adm.ev.fromPrev', { p: prev ? `${Math.round((s.n / prev) * 100)}%` : '-' }) : undefined}
            />
          );
        })}
      </Panel>
      <Panel title={t('adm.ev.clicks')} sub={t('adm.ev.clicksSub')}>
        <Segmented
          label={t('adm.ev.clicks')}
          options={[
            { value: 'all', label: fAll ?? '' },
            { value: 'btn', label: fBtn ?? '' },
            { value: 'screen', label: fScreen ?? '' },
          ]}
          value={filter}
          onPick={setFilter}
        />
        {list.length === 0 && <span className="text-[13px] font-medium text-hint">{t('adm.empty')}</span>}
        {list.map((e) => (
          <Meter
            key={e.name}
            label={known.includes(e.name) ? t(`adm.ev.names.${e.name}`) : e.name}
            value={num(e.count)}
            share={e.count / top}
            sub={`${t(`adm.ev.kind.${e.kind}`)} · ${t('adm.ev.users', { n: num(e.users), players: pw(t, e.users, 'player') })}`}
          />
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Источники

const AUTO_SOURCES = ['organic', 'ref', 'duel', 'inline'];
const isAutoSource = (id: string) => AUTO_SOURCES.includes(id);

function SourcesTab({ days }: { days: AdminPeriod }) {
  const { t } = useTranslation();
  const num = useNum();
  const q = useQuery({ queryKey: adminKeys.sources(days), queryFn: () => api.admin.sources(days) });
  if (!q.data) return <Pending q={q} tiles={0} />;
  const top = Math.max(1, ...q.data.sources.map((s) => s.users));
  const cols: CSSProperties = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 40px 46px 36px 46px', gap: 4 };
  const pct = (v: number | null) => (v === null ? '-' : `${num(v, 0)}%`);
  // Своя ссылка - её метка; рефералы, дуэли и «без метки» считаются сами - у них только пометка.
  const codeOf = (id: string, url: string | null) => (url ? `src_${id}` : isAutoSource(id) ? null : id);
  const nameOf = (id: string, title: string | null) =>
    title ?? (['aidpost', 'tgads', 'ref', 'duel', 'inline', 'organic'].includes(id) ? t(`adm.src.names.${id}`) : id);
  const copy = async (url: string) => {
    try {
      await copyText(url);
      showToast('success', 'adm.link.copied');
    } catch {
      showToast('error', 'toast.error');
    }
  };
  return (
    <>
      <Button size="m" icon={<Icon glyph="link" size={20} stroke={2.4} />} onClick={() => adminActions.openSheet({ kind: 'link' })}>
        {t('adm.src.create')}
      </Button>
      <Panel title={t('adm.src.table')} sub={t('adm.src.tableSub')}>
        <div role="table" aria-label={t('adm.src.table')} className="flex flex-col gap-1">
          <div role="row" className="text-[11px] font-bold text-hint" style={cols}>
            <span role="columnheader" />
            <span role="columnheader" className="text-right">
              {t('adm.src.cols.users')}
            </span>
            <span role="columnheader" className="text-right">
              {t('adm.src.cols.first')}
            </span>
            <span role="columnheader" className="text-right">
              {t('adm.src.cols.d7')}
            </span>
            <span role="columnheader" className="text-right">
              {t('adm.src.cols.stars')}
            </span>
          </div>
          {q.data.sources.length === 0 && <span className="py-2 text-[13px] font-medium text-hint">{t('adm.empty')}</span>}
          {q.data.sources.map((s) => {
            const name = nameOf(s.id, s.title);
            const body = (
              <>
                <span role="cell" className="flex min-w-0 flex-col gap-[3px]">
                  <span className="line-clamp-2 text-[14px] leading-[1.25] font-bold break-words">{name}</span>
                  <span className="flex min-w-0 items-center gap-1.5">
                    {codeOf(s.id, s.url) && (
                      <span className="truncate font-mono text-[11px]" style={{ color: HINT }}>
                        {codeOf(s.id, s.url)}
                      </span>
                    )}
                    {s.auto && (
                      <span className="qd-chip" style={{ height: 18, padding: '0 6px', fontSize: 10 }}>
                        {t('adm.src.auto')}
                      </span>
                    )}
                  </span>
                  <span aria-hidden="true" className="h-1 overflow-hidden rounded-[2px]" style={{ background: 'var(--qd-chart-track)' }}>
                    <span className="block h-full rounded-[2px]" style={{ width: `${Math.round((s.users / top) * 100)}%`, background: 'var(--qd-chart)' }} />
                  </span>
                </span>
                <span role="cell" className="qd-num text-right text-[13px] font-bold">
                  {num(s.users)}
                </span>
                <span role="cell" className="qd-num text-right text-[13px] font-semibold">
                  {pct(s.first)}
                </span>
                <span role="cell" className="qd-num text-right text-[13px] font-semibold">
                  {pct(s.d7)}
                </span>
                <span role="cell" className="qd-num text-right text-[13px] font-semibold">
                  {num(s.stars)}
                </span>
              </>
            );
            const rowStyle: CSSProperties = {
              ...cols,
              alignItems: 'center',
              minHeight: 56,
              borderTop: '1px solid var(--tg-theme-section-separator-color, rgba(140,150,200,.16))',
              padding: '8px 0',
            };
            return s.url ? (
              <button
                key={s.id}
                type="button"
                role="row"
                aria-label={t('adm.src.copyAria', { name })}
                onClick={() => void copy(s.url!)}
                className="qd-press cursor-pointer border-0 bg-transparent text-left text-text"
                style={{ ...rowStyle, fontFamily: 'inherit' }}
              >
                {body}
              </button>
            ) : (
              <div key={s.id} role="row" style={rowStyle}>
                {body}
              </div>
            );
          })}
          {q.data.sources.some((s) => s.url) && <span className="pt-1 text-[12px] font-medium text-hint">{t('adm.src.copyHint')}</span>}
        </div>
      </Panel>
      {q.data.refTop.length > 0 && (
        <Panel title={t('adm.src.refTop')}>
          {q.data.refTop.map((r) => (
            <div key={r.id} className="flex items-center gap-3">
              <Avatar id={r.id} name={r.name} size={40} on="none" />
              <span className="flex min-w-0 grow flex-col gap-px">
                <span className="truncate text-[15px] font-bold">{r.name}</span>
                <span className="text-[12px] font-medium text-hint">{t('adm.src.invited', { n: num(r.invited) })}</span>
              </span>
            </div>
          ))}
        </Panel>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Деньги

function MoneyTab({ days }: { days: AdminPeriod }) {
  const { t } = useTranslation();
  const num = useNum();
  const q = useQuery({ queryKey: adminKeys.money(days), queryFn: () => api.admin.money(days) });
  if (!q.data) return <Pending q={q} />;
  const { kpi: K, ads, coins, products } = q.data;
  const totalStars = products.reduce((a, p) => a + p.stars, 0);
  const watched = ads.forced ? ads.forcedDone / ads.forced : 0;
  const closed = Math.max(0, ads.forced - ads.forcedDone);
  const topAds = Math.max(1, ads.reward, ads.topic);
  const spendTotal = coins.spend.topics + coins.spend.glow + coins.spend.packs;
  const pctOf = (part: number, whole: number) => (whole ? `${Math.round((part / whole) * 100)}%` : '-');
  return (
    <>
      <section className="grid grid-cols-2 gap-2.5">
        <Kpi label={t('adm.kpi.stars')} value={`${num(K.stars)} ⭐`} delta={K.starsD} />
        <Kpi
          label={t('adm.kpi.buyers')}
          value={num(K.buyers)}
          delta={K.buyersD}
          sub={K.activeBuyersShare === null ? undefined : t('adm.kpi.buyersSub', { p: `${num(K.activeBuyersShare)}%` })}
        />
        <Kpi label={t('adm.kpi.arppu')} value={`${num(K.arppu)} ⭐`} />
        <Kpi label={t('adm.kpi.adFree')} value={num(K.adFree)} sub={t('adm.kpi.adFreeSub')} />
      </section>
      <Panel title={t('adm.money.stars')} sub={days === 90 ? t('adm.chart.weeklySum') : undefined}>
        <Bars data={q.data.stars} label={t('adm.money.stars')} />
      </Panel>
      <Panel title={t('adm.money.purchases')}>
        {products.length === 0 && <span className="text-[13px] font-medium text-hint">{t('adm.empty')}</span>}
        {products.map((p) => (
          <Meter
            key={p.product}
            label={t(`adm.money.products.${PRODUCT_KEY[p.product]}`)}
            value={t('adm.money.sales', { n: num(p.count), purchases: pw(t, p.count, 'purchase') })}
            share={totalStars ? p.stars / totalStars : 0}
            sub={`${num(p.stars)} ⭐ · ${pctOf(p.stars, totalStars)}`}
          />
        ))}
      </Panel>
      <Panel title={t('adm.money.ads')} sub={t('adm.money.adsSub')}>
        <div className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[14px] font-semibold">{t('adm.money.adsRows.shown')}</span>
            <span className="qd-num text-[14px] font-bold">{num(ads.forced)}</span>
          </div>
          {/* Обязательная реклама - одно целое из двух частей: досмотрели и закрыли раньше */}
          <div
            role="img"
            aria-label={`${t('adm.money.adsRows.watched')} ${pctOf(ads.forcedDone, ads.forced)}, ${t('adm.money.adsRows.skipped')} ${pctOf(closed, ads.forced)}`}
            className="flex h-2.5 gap-[2px] overflow-hidden rounded-[5px]"
          >
            {ads.forced > 0 ? (
              <>
                {ads.forcedDone > 0 && <span style={{ width: `${Math.round(watched * 100)}%`, background: 'var(--qd-chart)' }} />}
                {closed > 0 && <span className="grow" style={{ background: 'var(--qd-chart-muted)' }} />}
              </>
            ) : (
              <span className="grow" style={{ background: 'var(--qd-chart-track)' }} />
            )}
          </div>
          <div className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12px] font-semibold">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--qd-chart)' }} />
              {`${t('adm.money.adsRows.watched')} · ${pctOf(ads.forcedDone, ads.forced)} · ${num(ads.forcedDone)}`}
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-[3px]" style={{ background: 'var(--qd-chart-muted)' }} />
              {`${t('adm.money.adsRows.skipped')} · ${pctOf(closed, ads.forced)} · ${num(closed)}`}
            </span>
          </div>
        </div>
        <Meter label={t('adm.money.adsRows.reward')} value={num(ads.reward)} share={ads.reward / topAds} />
        <Meter label={t('adm.money.adsRows.topic')} value={num(ads.topic)} share={ads.topic / topAds} />
      </Panel>
      <Panel title={t('adm.money.coins')}>
        <div className="grid grid-cols-2 gap-2.5">
          {(
            [
              ['earned', coins.earned],
              ['spent', coins.spent],
            ] as const
          ).map(([key, v]) => (
            <div key={key} className="qd-glass flex flex-col gap-0.5 rounded-[18px] px-3 py-2.5">
              <span className="text-[12px] font-semibold text-hint">{t(`adm.money.${key}`)}</span>
              <span className="qd-num text-[19px] font-bold">{num(v)}</span>
            </div>
          ))}
        </div>
        <span className="text-[13px] font-bold">{t('adm.money.spend')}</span>
        {(['topics', 'glow', 'packs'] as const).map((k) => (
          <Meter key={k} label={t(`adm.money.spendRows.${k}`)} value={pctOf(coins.spend[k], spendTotal)} share={spendTotal ? coins.spend[k] / spendTotal : 0} />
        ))}
      </Panel>
    </>
  );
}

// ---------------------------------------------------------------------------
// Задания

export function taskTitle(task: Pick<AdminTask, 'type' | 'channel' | 'titleRu' | 'titleEn'>, t: (k: string) => string, lang: string) {
  const custom = lang.startsWith('en') ? (task.titleEn ?? task.titleRu) : (task.titleRu ?? task.titleEn);
  if (custom) return custom;
  return task.type === 'channel' ? `${t('adm.tasks.types.channel')} ${task.channel ?? ''}` : t(`adm.tasks.types.${task.type}`);
}

function TasksTab() {
  const { t, i18n } = useTranslation();
  const num = useNum();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: adminKeys.tasks, queryFn: api.admin.tasks });
  if (!q.data) return <Pending q={q} tiles={0} />;
  const toggle = async (task: AdminTask) => {
    const next = !task.on;
    queryClient.setQueryData<AdminTask[]>(adminKeys.tasks, (list) => list?.map((x) => (x.id === task.id ? { ...x, on: next } : x)));
    try {
      await api.admin.saveTask({
        id: task.id,
        type: task.type,
        channel: task.channel,
        goal: task.goal,
        reward: task.reward,
        on: next,
        titleRu: task.titleRu ?? null,
        titleEn: task.titleEn ?? null,
      });
      void queryClient.invalidateQueries({ queryKey: ['wallet'] });
    } catch {
      showToast('error', 'adm.task.saveError');
      void q.refetch();
    }
  };
  return (
    <>
      <p className="qd-glass m-0 rounded-[20px] px-3.5 py-3 text-[13px] leading-[1.45] font-medium text-hint">{t('adm.tasks.hint')}</p>
      <Button size="m" icon={<Icon glyph="plus" size={20} stroke={2.4} />} onClick={() => adminActions.openSheet({ kind: 'task', task: null })}>
        {t('adm.tasks.add')}
      </Button>
      {q.data.map((task) => {
        const look = TASK_LOOK[task.type];
        const title = taskTitle(task, t, i18n.language);
        const goal =
          task.type === 'play'
            ? ` · ${t('adm.tasks.goalPlay', { n: task.goal })}`
            : task.type === 'ads'
              ? ` · ${t('adm.tasks.goalAds', { n: task.goal })}`
              : '';
        return (
          <div key={task.id} className="qd-card flex items-center gap-2.5 rounded-[24px] py-2.5 pr-2.5 pl-3" style={{ opacity: task.on ? 1 : 0.62 }}>
            <button
              type="button"
              aria-label={title}
              onClick={() => adminActions.openSheet({ kind: 'task', task })}
              className="qd-press flex min-w-0 grow cursor-pointer items-center gap-3 border-0 bg-transparent p-0 text-left text-text"
              style={{ fontFamily: 'inherit' }}
            >
              <span
                aria-hidden="true"
                className="qd-ball h-[42px] w-[42px]"
                style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}
              >
                <Icon glyph={look.glyph} size={20} stroke={2.3} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="truncate text-[15px] font-bold">{title}</span>
                <span className="qd-num truncate text-[12px] font-bold" style={{ color: 'var(--qd-gold-text)' }}>
                  {t('adm.tasks.meta', { n: num(task.reward), freq: t(`adm.tasks.freq.${task.freq}`) }) + goal}
                </span>
                <span className="qd-num text-[12px] font-medium text-hint">{task.on ? t('adm.tasks.done', { n: num(task.done) }) : t('adm.tasks.off')}</span>
                {task.type === 'channel' && <BotLine ok={task.botAdmin} />}
              </span>
            </button>
            <Switch on={task.on} label={t('adm.tasks.toggleAria', { name: title })} onToggle={() => void toggle(task)} />
          </div>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------
// Игроки

const WEEK = 7 * 86_400_000;

type PlayerFilter = 'all' | 'new' | 'paying' | 'banned';

function PlayersTab() {
  const { t, i18n } = useTranslation();
  const num = useNum();
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<PlayerFilter>('all');
  // Поиск - через 300 мс после последней буквы, а не на каждое нажатие.
  useEffect(() => {
    const id = window.setTimeout(() => setQuery(text.trim()), 300);
    return () => window.clearTimeout(id);
  }, [text]);
  const q = useQuery({ queryKey: adminKeys.players(query, filter), queryFn: () => api.admin.players(query, filter), placeholderData: (prev) => prev });
  const labels = t('adm.pl.filter').split('|');
  const now = Date.now();
  return (
    <>
      <label className="qd-glass flex h-12 items-center gap-2.5 rounded-[24px] px-4" style={{ color: HINT }}>
        <Icon glyph="search" size={19} stroke={2.4} />
        <input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('adm.pl.search')}
          aria-label={t('adm.pl.search')}
          className="h-full min-w-0 grow border-0 bg-transparent p-0 text-[15px] font-medium text-text outline-none"
          enterKeyHint="search"
        />
      </label>
      <Segmented
        label={t('adm.pl.search')}
        options={(['all', 'new', 'paying', 'banned'] as const).map((v, i) => ({ value: v, label: labels[i] ?? v }))}
        value={filter}
        onPick={setFilter}
      />
      {q.data && (
        <span className="qd-num mx-1 text-[13px] font-semibold text-hint">
          {q.data.length ? t('adm.pl.count', { n: num(q.data.length), players: pw(t, q.data.length, 'player') }) : t('adm.pl.none')}
        </span>
      )}
      {!q.data &&
        (q.isError ? <Pending q={q} /> : [0, 1, 2, 3].map((i) => <div key={i} aria-hidden="true" className="qd-skel qd-glass h-[66px] rounded-[22px]" />))}
      {q.data?.map((u) => {
        const fresh = now - u.createdAt < WEEK;
        const tag = u.banned
          ? ['adm.pl.banned', 'qd-chip-bad']
          : u.stars > 0
            ? ['adm.pl.payer', 'qd-chip-gold']
            : fresh
              ? ['adm.pl.fresh', 'qd-chip-brand']
              : null;
        return (
          <button
            key={u.id}
            type="button"
            onClick={() => adminActions.openSheet({ kind: 'player', player: u })}
            className="qd-press qd-card box-border flex w-full cursor-pointer items-center gap-3 rounded-[22px] border-0 px-3 py-2.5 text-left text-text"
            style={{ opacity: u.banned ? 0.62 : 1, fontFamily: 'inherit' }}
          >
            <Avatar id={u.id} name={u.name} photoUrl={u.photoUrl} size={44} on="none" glow={u.glow} />
            <span className="flex min-w-0 grow flex-col gap-0.5">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="min-w-0 truncate text-[15px] font-bold">{u.name}</span>
                {tag && (
                  <span className={`qd-chip shrink-0 ${tag[1]}`} style={{ height: 20, padding: '0 7px', fontSize: 11 }}>
                    {t(tag[0]!)}
                  </span>
                )}
              </span>
              <span className="truncate text-[12px] font-medium text-hint">
                {[u.username ? `@${u.username}` : `ID ${u.id}`, seenText(u.lastSeenAt, i18n.language, t, now)].join(' · ')}
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-[3px]">
              <span className="qd-num flex items-center gap-[3px] text-[13px] font-bold" style={{ color: 'var(--qd-gold-text)' }}>
                <Icon glyph="rating" size={13} stroke={2.6} />
                {num(u.rating)}
              </span>
              <span className="qd-num flex items-center gap-[3px] text-[12px] font-semibold text-hint">
                <Icon glyph="coin" size={12} stroke={2.6} />
                {num(u.coins)}
              </span>
            </span>
          </button>
        );
      })}
    </>
  );
}

// ---------------------------------------------------------------------------

export function AdminScreen({ me }: { me: MeResponse }) {
  const tab = useAdmin((s) => s.tab);
  const days = useAdmin((s) => s.days);
  const sheet = useAdmin((s) => s.sheet);
  // «Назад»: сначала закрывает шторку, потом - саму админку.
  useEffect(() => onBack(sheet ? adminActions.closeSheet : adminActions.close), [sheet]);
  if (!me.admin) return null;
  return (
    <div className="relative min-h-[var(--tg-viewport-stable-height,100dvh)]">
      <main className="qd-screen flex flex-col gap-3.5">
        <Header tab={tab} days={days} />
        <div key={tab} className="qd-in flex flex-col gap-3.5">
          {tab === 'overview' && <OverviewTab days={days} />}
          {tab === 'retention' && <RetentionTab />}
          {tab === 'events' && <EventsTab days={days} />}
          {tab === 'sources' && <SourcesTab days={days} />}
          {tab === 'money' && <MoneyTab days={days} />}
          {tab === 'tasks' && <TasksTab />}
          {tab === 'players' && <PlayersTab />}
        </div>
      </main>
      <AdminSheets days={days} />
    </div>
  );
}
