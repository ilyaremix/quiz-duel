/** Плитка статистики: крупное число и подпись. На фоне экрана - стекло; внутри стеклянной карточки (шторки) - лёгкая подложка. */
export function StatTile({ value, label, on = 'page', muted = false }: { value: string; label: string; on?: 'page' | 'card'; muted?: boolean }) {
  const card = on === 'card';
  return (
    <div
      className="box-border flex min-h-[70px] w-full flex-col items-center justify-center gap-[3px] rounded-[22px] px-1.5 pt-3 pb-2.5 text-center"
      style={{
        background: card ? 'var(--qd-chip)' : 'var(--qd-sheen), var(--qd-glass)',
        boxShadow: card ? 'inset 0 1px 0 rgba(255, 255, 255, 0.2)' : 'var(--qd-glass-edge)',
      }}
    >
      <span
        className="qd-num text-[19px] font-bold tracking-[-0.01em] whitespace-nowrap"
        style={{ color: muted ? 'var(--tg-theme-hint-color)' : 'var(--tg-theme-text-color)' }}
      >
        {value}
      </span>
      <span className="text-[12px] leading-[1.2] font-medium text-hint">{label}</span>
    </div>
  );
}
