const SIZES = { m: 1, l: 1.5, xl: 2.4 } as const;

interface LogoProps {
  size?: keyof typeof SIZES;
  wordmark?: boolean;
}

/** Логотип: два глянцевых «пузыря» - «?» игрока (синий) и «!» соперника (оранжевый) со свечением; «Duel» - градиентом. */
export function Logo({ size = 'm', wordmark = true }: LogoProps) {
  const k = SIZES[size];
  const r = (n: number) => Math.round(n * k);
  const c = r(40);
  const glow = r(16);
  const bubble = 'radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.6), rgba(255, 255, 255, 0) 48%)';

  return (
    <div role="img" aria-label="Quiz Duel" className="inline-flex items-center text-text" style={{ gap: r(12) }}>
      <div aria-hidden="true" className="relative shrink-0" style={{ width: r(66), height: r(54) }}>
        <div
          className="absolute top-0 left-0 flex items-center justify-center leading-none font-extrabold text-white"
          style={{
            width: c,
            height: c,
            borderRadius: '50% 50% 50% 18%',
            fontSize: r(22),
            background: `${bubble}, linear-gradient(160deg, #5B95FF, #2A55C8)`,
            boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 0 ${glow}px rgba(79, 141, 255, 0.6)`,
          }}
        >
          ?
        </div>
        <div
          className="absolute box-border flex items-center justify-center leading-none font-extrabold"
          style={{
            left: r(26),
            top: r(14),
            width: c,
            height: c,
            borderRadius: '50% 50% 18% 50%',
            border: `${Math.max(3, r(4))}px solid var(--qd-ring-gap)`,
            fontSize: r(22),
            color: '#2A1405',
            background: `${bubble}, linear-gradient(160deg, #FFB067, #F26A1B)`,
            boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 0 ${glow}px rgba(255, 138, 61, 0.55)`,
          }}
        >
          !
        </div>
      </div>
      {wordmark && (
        <div className="flex items-baseline leading-[1.05] font-bold tracking-[-0.03em]" style={{ gap: r(6), fontSize: r(28) }}>
          <span>Quiz</span>
          <span
            style={{
              backgroundImage: 'linear-gradient(90deg, #6FA3FF, #A779FF 55%, #FF7D9B)',
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            Duel
          </span>
        </div>
      )}
    </div>
  );
}
