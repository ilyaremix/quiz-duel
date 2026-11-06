import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { MeResponse } from '@quiz-duel/shared';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Logo } from '../components/Logo';
import { formatNumber } from '../i18n';
import type { SocketStatus } from '../lib/socket';

type RowState = 'ok' | 'wait' | 'fail';

function StatusRow({ label, value, state }: { label: string; value: ReactNode; state: RowState }) {
  const color = state === 'ok' ? 'var(--qd-correct-text)' : state === 'fail' ? 'var(--qd-wrong-text)' : 'var(--tg-theme-hint-color)';
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-separator py-2 last:border-b-0">
      <span
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
        style={{
          color,
          background: state === 'ok' ? 'var(--qd-correct-tint)' : state === 'fail' ? 'var(--qd-wrong-tint)' : 'var(--qd-surface-2)',
        }}
      >
        {state === 'wait' ? (
          <span className="qd-spin h-3.5 w-3.5 rounded-full border-2 border-current border-t-transparent" />
        ) : (
          <Icon glyph={state === 'ok' ? 'check' : 'close'} size={16} stroke={3} />
        )}
      </span>
      <span className="grow text-[15px] font-bold whitespace-nowrap">{label}</span>
      <span className="qd-num text-right text-[13px] font-bold" style={{ color }}>
        {value}
      </span>
    </li>
  );
}

interface HelloScreenProps {
  me: MeResponse;
  socket: SocketStatus;
}

/** Этап 1: игрок видит себя - значит, Telegram, сервер, база и сокет связаны. */
export function HelloScreen({ me, socket }: HelloScreenProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const langName = t(`langName.${me.lang}`);

  const socketState: RowState = socket.state === 'connected' ? 'ok' : socket.state === 'error' ? 'fail' : 'wait';
  const socketValue =
    socket.state === 'connected' ? t('check.socketOk') : socket.state === 'error' ? t('check.socketFail') : t('check.socketWait');

  return (
    <main className="qd-screen qd-screen-in flex flex-col gap-4">
      <header className="flex justify-center py-2">
        <Logo size="m" />
      </header>

      <section className="flex items-center gap-4 rounded-[24px] bg-section p-4 shadow-[0_4px_0_var(--qd-lip)]">
        <Avatar id={me.id} name={me.firstName} photoUrl={me.photoUrl} size={64} ring="me" />
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 truncate text-[24px] font-extrabold leading-tight">{t('hello.title', { name: me.firstName })}</h1>
          {me.username && <span className="truncate text-[13px] font-bold text-hint">@{me.username}</span>}
          <span className="qd-num text-[15px] font-extrabold">
            <span className="text-gold-text">★ </span>
            {t('hello.rating')} {formatNumber(me.rating, lang)}
            <span className="font-bold text-hint"> · {t('hello.games', { count: me.games })}</span>
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded-[24px] bg-section px-4 pt-4 pb-2 shadow-[0_4px_0_var(--qd-lip)]">
        <h2 className="m-0 text-[17px] font-extrabold">{t('check.title')}</h2>
        <p className="m-0 text-[13px] font-bold leading-snug text-hint">{t('check.note')}</p>
        <ul className="m-0 list-none p-0">
          <StatusRow label={t('check.auth')} value={t('check.authOk')} state="ok" />
          <StatusRow label={t('check.db')} value={t('check.dbOk')} state="ok" />
          <StatusRow label={t('check.socket')} value={socketValue} state={socketState} />
          {socket.state === 'connected' && (
            <StatusRow
              label={t('check.clock')}
              value={t('check.clockValue', { ms: formatNumber(socket.clockOffsetMs, lang) })}
              state="ok"
            />
          )}
          <StatusRow
            label={t('check.lang')}
            value={me.language === 'auto' ? t('check.langAuto', { lang: langName }) : t('check.langSet', { lang: langName })}
            state="ok"
          />
        </ul>
      </section>
    </main>
  );
}
