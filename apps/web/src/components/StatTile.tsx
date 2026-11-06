/** Плитка статистики: крупное число и подпись. on - на фоне страницы или внутри карточки (шторки). */
export function StatTile({ value, label, on = 'page', muted = false }: { value: string; label: string; on?: 'page' | 'card'; muted?: boolean }) {
  return (
    <div
      className="box-border flex min-h-16 w-full flex-col items-center justify-center gap-0.5 rounded-2xl px-1.5 py-2.5 text-center"
      style={{ background: on === 'card' ? 'var(--qd-surface-2)' : 'var(--tg-theme-section-bg-color)' }}
    >
      <span className="qd-num text-[18px] font-black whitespace-nowrap" style={{ color: muted ? 'var(--tg-theme-hint-color)' : 'var(--tg-theme-text-color)' }}>
        {value}
      </span>
      <span className="text-[11px] leading-[1.2] font-bold text-hint">{label}</span>
    </div>
  );
}
