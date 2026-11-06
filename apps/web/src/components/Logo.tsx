const SIZES = { m: 1, l: 1.5, xl: 2.4 } as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  wordmark?: boolean;
}

/** Логотип: «?» игрока и «!» соперника + надпись Quiz Duel. */
export function Logo({ size = 'm', wordmark = true }: LogoProps) {
  const k = SIZES[size];
  const r = (n: number) => Math.round(n * k);
  const bubble = r(40);

  return (
    <div role="img" aria-label="Quiz Duel" className="inline-flex items-center text-text" style={{ gap: r(12) }}>
      <div aria-hidden="true" className="relative shrink-0" style={{ width: r(66), height: r(54) }}>
        <div
          className="absolute left-0 top-0 flex items-center justify-center bg-me font-black leading-none text-white"
          style={{ width: bubble, height: bubble, borderRadius: '50% 50% 50% 18%', fontSize: r(22) }}
        >
          ?
        </div>
        <div
          className="absolute box-border flex items-center justify-center bg-opp font-black leading-none text-on-fill"
          style={{
            left: r(26),
            top: r(14),
            width: bubble,
            height: bubble,
            borderRadius: '50% 50% 18% 50%',
            border: `${Math.max(3, r(4))}px solid var(--tg-theme-secondary-bg-color)`,
            fontSize: r(22),
          }}
        >
          !
        </div>
      </div>
      {wordmark && (
        <div className="flex items-baseline font-black leading-none tracking-[-0.02em]" style={{ gap: r(6), fontSize: r(28) }}>
          <span>Quiz</span>
          <span className="text-brand-text">Duel</span>
        </div>
      )}
    </div>
  );
}
