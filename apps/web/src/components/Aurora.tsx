import { useEffect } from 'react';
import { create } from 'zustand';

/** default - синий, фиолетовый, розовый, бирюзовый; vs - синий против оранжевого; gold - с золотом (победа, ачивки). */
export type AuroraTone = 'default' | 'vs' | 'gold';

const useAuroraStore = create<{ tone: AuroraTone }>(() => ({ tone: 'default' }));

/** Экран просит свой вариант фона; когда экран уходит, фон снова обычный. */
export function useAuroraTone(tone: AuroraTone) {
  useEffect(() => {
    useAuroraStore.setState({ tone });
    return () => useAuroraStore.setState({ tone: 'default' });
  }, [tone]);
}

/**
 * Фон-аврора: четыре цветных пятна медленно дрейфуют под стеклом.
 * Один слой на всё приложение, поэтому при смене экрана пятна не прыгают. Без анимаций - стоят на месте.
 */
export function Aurora() {
  const tone = useAuroraStore((s) => s.tone);
  const variant = tone === 'vs' ? ' qd-au-vs' : tone === 'gold' ? ' qd-au-gold' : '';
  return (
    <div aria-hidden="true" className={`qd-aurora${variant}`}>
      <i />
      <i />
      <i />
      <i />
    </div>
  );
}
