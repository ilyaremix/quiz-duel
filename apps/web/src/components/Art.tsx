/**
 * Рисунки магазина: пакеты монет (горсть, мешок, сундук) и свои реакции платных наборов.
 * Базовый набор - обычные эмодзи (бесплатно), платные - нарисованные стикеры в стиле стекла:
 * глянец, блик сверху, тонкая тёмная кромка (видна и на светлой теме).
 * Код реакции в протоколе прежний - эмодзи; рисунок выбирается по нему.
 * live - стикер «живёт» (у отправленной реакции и в превью товара); в режиме без анимаций - стоит.
 */
import { useId, type CSSProperties, type ReactNode } from 'react';
import type { CoinPackId } from '@quiz-duel/shared';

/** Уникальные id градиентов: на экране может быть несколько одинаковых стикеров. */
function useUid() {
  return useId().replace(/[^a-zA-Z0-9_-]/g, '');
}

const EDGE = 'rgba(20, 12, 50, 0.28)';

function Svg({ size, label, live, children, className = '' }: { size: number; label?: string; live?: boolean; children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`qd-art ${live ? 'qd-art-live' : ''} ${className}`}
      style={{ overflow: 'visible', display: 'block' }}
    >
      {children}
    </svg>
  );
}

/** Блик сверху слева - как у глянцевых шаров интерфейса. */
const Shine = ({ cx = 24, cy = 20, rx = 11, ry = 6.5, o = 0.55, rot = -24 }: { cx?: number; cy?: number; rx?: number; ry?: number; o?: number; rot?: number }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill="#fff" opacity={o} transform={`rotate(${rot} ${cx} ${cy})`} />
);

/** Четырёхлучевая искра. */
const Spark = ({ x, y, r, fill = '#fff', className }: { x: number; y: number; r: number; fill?: string; className?: string }) => (
  <path
    className={className}
    d={`M${x} ${y - r}C${x + r * 0.18} ${y - r * 0.18} ${x + r * 0.18} ${y - r * 0.18} ${x + r} ${y}C${x + r * 0.18} ${y + r * 0.18} ${x + r * 0.18} ${y + r * 0.18} ${x} ${y + r}C${x - r * 0.18} ${y + r * 0.18} ${x - r * 0.18} ${y + r * 0.18} ${x - r} ${y}C${x - r * 0.18} ${y - r * 0.18} ${x - r * 0.18} ${y - r * 0.18} ${x} ${y - r}Z`}
    fill={fill}
  />
);

/** Круглое «лицо» стикера: градиент, внутренняя тень снизу, блик. */
function Face({ id, from, to, shade }: { id: string; from: string; to: string; shade: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}f`} cx="38%" cy="30%" r="75%">
          <stop offset="0" stopColor={from} />
          <stop offset="1" stopColor={to} />
        </radialGradient>
        <radialGradient id={`${id}s`} cx="50%" cy="100%" r="60%">
          <stop offset="0" stopColor={shade} stopOpacity="0.55" />
          <stop offset="1" stopColor={shade} stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="33" r="24" fill={`url(#${id}f)`} stroke={EDGE} strokeWidth="1.2" />
      <circle cx="32" cy="33" r="24" fill={`url(#${id}s)`} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Монеты

/** Одна монета (вид чуть сверху): ребро, лицевая сторона с ободком и звездой. */
function Coin({ x, y, r = 10, id, tilt = 0.55 }: { x: number; y: number; r?: number; id: string; tilt?: number }) {
  const ry = r * tilt;
  const edge = r * 0.32;
  return (
    <g>
      <path d={`M${x - r} ${y}v${edge}a${r} ${ry} 0 0 0 ${r * 2} 0v-${edge}`} fill="#C98512" stroke={EDGE} strokeWidth="0.9" />
      <ellipse cx={x} cy={y} rx={r} ry={ry} fill={`url(#${id}c)`} stroke={EDGE} strokeWidth="0.9" />
      <ellipse cx={x} cy={y} rx={r * 0.72} ry={ry * 0.72} fill="none" stroke="#F2A81D" strokeWidth="1.3" opacity="0.9" />
      <path
        d={`M${x} ${y - ry * 0.42}l${r * 0.13} ${ry * 0.27}l${r * 0.3} ${ry * 0.04}l-${r * 0.22} ${ry * 0.2}l${r * 0.07} ${ry * 0.32}l-${r * 0.28} -${ry * 0.17}l-${r * 0.28} ${ry * 0.17}l${r * 0.07} -${ry * 0.32}l-${r * 0.22} -${ry * 0.2}l${r * 0.3} -${ry * 0.04}z`}
        fill="#E69A10"
        opacity="0.85"
      />
      <ellipse cx={x - r * 0.35} cy={y - ry * 0.35} rx={r * 0.32} ry={ry * 0.22} fill="#fff" opacity="0.6" />
    </g>
  );
}

function CoinDefs({ id }: { id: string }) {
  return (
    <defs>
      <radialGradient id={`${id}c`} cx="35%" cy="30%" r="80%">
        <stop offset="0" stopColor="#FFF3B0" />
        <stop offset="0.45" stopColor="#FFD24A" />
        <stop offset="1" stopColor="#F0A417" />
      </radialGradient>
    </defs>
  );
}

/** Горсть: три монеты стопкой и одна рядом. */
function Handful({ id }: { id: string }) {
  return (
    <>
      <CoinDefs id={id} />
      <ellipse cx="32" cy="52" rx="20" ry="4.5" fill="#000" opacity="0.18" />
      <Coin id={id} x={28} y={45} r={13} />
      <Coin id={id} x={28} y={38} r={13} />
      <Coin id={id} x={28} y={31} r={13} />
      <Coin id={id} x={45} y={45.5} r={10} />
      <Spark x={47} y={22} r={4.5} fill="#FFF6C8" className="qd-art-tw" />
    </>
  );
}

/** Мешок: бархатный мешок с золотой монетой-гербом, шнурок, монеты рядом. */
function Bag({ id }: { id: string }) {
  return (
    <>
      <CoinDefs id={id} />
      <defs>
        <radialGradient id={`${id}b`} cx="35%" cy="35%" r="80%">
          <stop offset="0" stopColor="#B88BFF" />
          <stop offset="0.55" stopColor="#7A45EE" />
          <stop offset="1" stopColor="#4B22B5" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="56" rx="22" ry="4.5" fill="#000" opacity="0.2" />
      {/* горло мешка */}
      <path d="M24 12c2 3 3 5 3 8h10c0-3 1-5 3-8-3 1.6-5.5 2-8 2s-5-.4-8-2z" fill={`url(#${id}b)`} stroke={EDGE} strokeWidth="1" />
      {/* тело */}
      <path d="M27 20c-9 4-15 12-15 21 0 9 8 14 20 14s20-5 20-14c0-9-6-17-15-21z" fill={`url(#${id}b)`} stroke={EDGE} strokeWidth="1.1" />
      {/* шнурок */}
      <path d="M25.5 20.5c4 1.6 9 1.6 13 0" fill="none" stroke="#FFD24A" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M38 21c3 1 5 3.5 4.5 6" fill="none" stroke="#FFD24A" strokeWidth="2" strokeLinecap="round" />
      <circle cx="42.6" cy="27.6" r="2" fill="#FFD24A" stroke={EDGE} strokeWidth="0.7" />
      {/* герб-монета */}
      <circle cx="32" cy="39" r="8.5" fill={`url(#${id}c)`} stroke="#C98512" strokeWidth="1.2" />
      <circle cx="32" cy="39" r="5.6" fill="none" stroke="#E69A10" strokeWidth="1.3" />
      <ellipse cx="29.4" cy="36.2" rx="2.4" ry="1.5" fill="#fff" opacity="0.65" />
      <Shine cx={21} cy={33} rx={5} ry={9} o={0.32} rot={18} />
      <Coin id={id} x={13} y={52} r={7} />
      <Coin id={id} x={51} y={53} r={6.5} />
      <Spark x={50} y={14} r={4} fill="#FFF6C8" className="qd-art-tw" />
    </>
  );
}

/** Сундук: открытый сундук, полный монет, золотые оковки и сияние. */
function Chest({ id }: { id: string }) {
  return (
    <>
      <CoinDefs id={id} />
      <defs>
        <linearGradient id={`${id}w`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#B4683A" />
          <stop offset="1" stopColor="#6E3517" />
        </linearGradient>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#C9784A" />
          <stop offset="1" stopColor="#8A4421" />
        </linearGradient>
        <radialGradient id={`${id}g`} cx="50%" cy="55%" r="50%">
          <stop offset="0" stopColor="#FFE680" stopOpacity="0.95" />
          <stop offset="1" stopColor="#FFB020" stopOpacity="0" />
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="25" ry="4.5" fill="#000" opacity="0.22" />
      {/* крышка (откинута назад) */}
      <path d="M11 26c0-9 9-15 21-15s21 6 21 15z" fill={`url(#${id}l)`} stroke={EDGE} strokeWidth="1.1" />
      <path d="M11 26c0-9 9-15 21-15s21 6 21 15" fill="none" stroke="#FFC83D" strokeWidth="2.4" />
      <path d="M22 13.5V26M42 13.5V26" stroke="#FFC83D" strokeWidth="2.2" />
      {/* сияние и монеты */}
      <ellipse cx="32" cy="30" rx="24" ry="12" fill={`url(#${id}g)`} className="qd-art-glow" />
      <Coin id={id} x={20} y={30} r={7} />
      <Coin id={id} x={32} y={27} r={8} />
      <Coin id={id} x={44} y={30} r={7} />
      <Coin id={id} x={26} y={33} r={7} />
      <Coin id={id} x={38} y={33} r={7} />
      {/* короб */}
      <path d="M10 33h44v17a4 4 0 0 1-4 4H14a4 4 0 0 1-4-4z" fill={`url(#${id}w)`} stroke={EDGE} strokeWidth="1.1" />
      <path d="M10 33h44" stroke="#FFC83D" strokeWidth="2.6" />
      <path d="M22 33v21M42 33v21" stroke="#FFC83D" strokeWidth="2.4" />
      {/* замок */}
      <rect x="27.5" y="36" width="9" height="10" rx="2.2" fill={`url(#${id}c)`} stroke="#B87511" strokeWidth="1" />
      <circle cx="32" cy="40.2" r="1.6" fill="#7A4A08" />
      <path d="M32 41v2.6" stroke="#7A4A08" strokeWidth="1.4" strokeLinecap="round" />
      <Shine cx={17} cy={39} rx={3} ry={6} o={0.22} rot={0} />
      <Spark x={52} y={14} r={4.6} fill="#FFF6C8" className="qd-art-tw" />
      <Spark x={10} y={18} r={3} fill="#FFF6C8" className="qd-art-tw qd-art-d2" />
    </>
  );
}

/** Рисунок пакета монет: s - горсть, m - мешок, l - сундук. */
export function CoinPackArt({ id, size = 56, live = false }: { id: CoinPackId; size?: number; live?: boolean }) {
  const uid = useUid();
  return (
    <Svg size={size} live={live}>
      {id === 's' ? <Handful id={uid} /> : id === 'm' ? <Bag id={uid} /> : <Chest id={uid} />}
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// Реакции: «Дерзкие»

function Cool({ id }: { id: string }) {
  return (
    <>
      <Face id={id} from="#C7A2FF" to="#6B38F0" shade="#2B0E7A" />
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1B1440" />
          <stop offset="1" stopColor="#0A0820" />
        </linearGradient>
        <clipPath id={`${id}k`}>
          <path d="M11 27h18c0 6-3 10-9 10s-9-4-9-10zM35 27h18c0 6-3 10-9 10s-9-4-9-10z" />
        </clipPath>
      </defs>
      {/* очки */}
      <path d="M9 26.5h46" stroke="#22D3EE" strokeWidth="2.8" strokeLinecap="round" />
      <path d="M11 27h18c0 6-3 10-9 10s-9-4-9-10zM35 27h18c0 6-3 10-9 10s-9-4-9-10z" fill={`url(#${id}g)`} stroke="#22D3EE" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 29.5h5" stroke="#5EEBFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <path d="M38 29.5h5" stroke="#5EEBFF" strokeWidth="1.6" strokeLinecap="round" opacity="0.8" />
      <g clipPath={`url(#${id}k)`}>
        <g className="qd-art-glint">
          <rect x="24" y="20" width="6" height="24" fill="#fff" opacity="0.7" transform="skewX(-24)" />
        </g>
      </g>
      {/* ухмылка */}
      <path d="M24 46c4 2.6 10 2.6 15-1.5" fill="none" stroke="#1B0F45" strokeWidth="2.6" strokeLinecap="round" />
      <Shine cx={22} cy={17} rx={9} ry={4.5} o={0.5} />
    </>
  );
}

function Clown({ id }: { id: string }) {
  return (
    <>
      {/* волосы */}
      <circle cx="10" cy="26" r="7.5" fill="#22D3EE" stroke={EDGE} strokeWidth="1" />
      <circle cx="11" cy="37" r="6.5" fill="#FF5FA2" stroke={EDGE} strokeWidth="1" />
      <circle cx="54" cy="26" r="7.5" fill="#22D3EE" stroke={EDGE} strokeWidth="1" />
      <circle cx="53" cy="37" r="6.5" fill="#FF5FA2" stroke={EDGE} strokeWidth="1" />
      <Face id={id} from="#FFFFFF" to="#E2DDF5" shade="#8A80B8" />
      {/* глаза-ромбы */}
      <path d="M22 19l3 6-3 6-3-6zM42 19l3 6-3 6-3-6z" fill="#5B8CFF" opacity="0.85" />
      <circle cx="22" cy="26" r="2.6" fill="#1B1440" />
      <circle cx="42" cy="26" r="2.6" fill="#1B1440" />
      {/* улыбка */}
      <path d="M17 39c4 9 26 9 30 0-5 3.5-25 3.5-30 0z" fill="#FF3B5C" stroke="#B3123A" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M22 41.5c6 2 14 2 20 0" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.9" />
      {/* нос */}
      <g className="qd-art-honk">
        <defs>
          <radialGradient id={`${id}n`} cx="35%" cy="30%" r="70%">
            <stop offset="0" stopColor="#FF8A9E" />
            <stop offset="1" stopColor="#E0103A" />
          </radialGradient>
        </defs>
        <circle cx="32" cy="33" r="6.4" fill={`url(#${id}n)`} stroke="#A00C2C" strokeWidth="1" />
        <ellipse cx="29.8" cy="30.8" rx="2.2" ry="1.4" fill="#fff" opacity="0.8" />
      </g>
      <Shine cx={22} cy={16} rx={8} ry={4} o={0.6} />
    </>
  );
}

function Skull({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}b`} cx="38%" cy="28%" r="80%">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#C9C2E6" />
        </radialGradient>
      </defs>
      {/* череп */}
      <path d="M32 7c-13 0-22 9-22 21 0 6 2.6 10.5 6.5 13.4V47h31v-5.6C51.4 38.5 54 34 54 28 54 16 45 7 32 7z" fill={`url(#${id}b)`} stroke={EDGE} strokeWidth="1.2" />
      {/* глазницы */}
      <path d="M17 27c0-4 3-7 7-7s7 3 7 7-2.5 7-7 7-7-3-7-7zM33 27c0-4 3-7 7-7s7 3 7 7-2.5 7-7 7-7-3-7-7z" fill="#23193F" />
      <circle cx="24" cy="27.5" r="2.4" fill="#FF4FD8" className="qd-art-tw" />
      <circle cx="40" cy="27.5" r="2.4" fill="#FF4FD8" className="qd-art-tw qd-art-d2" />
      <path d="M32 33l-3 5h6z" fill="#23193F" />
      {/* челюсть */}
      <g className="qd-art-jaw">
        <path d="M18 46h28v5a6 6 0 0 1-6 6H24a6 6 0 0 1-6-6z" fill={`url(#${id}b)`} stroke={EDGE} strokeWidth="1.1" />
        <path d="M25 46v7M32 46v8M39 46v7" stroke="#8D84B5" strokeWidth="1.6" strokeLinecap="round" />
      </g>
      <path d="M22 41.5v4.5M28 42v4.5M36 42v4.5M42 41.5v4.5" stroke="#8D84B5" strokeWidth="1.5" strokeLinecap="round" />
      <Shine cx={22} cy={15} rx={8} ry={4} o={0.7} />
    </>
  );
}

function Salute({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE6A0" />
          <stop offset="1" stopColor="#FFB547" />
        </linearGradient>
      </defs>
      <Face id={id} from="#FFE6A0" to="#FFB23F" shade="#B5600A" />
      {/* брови и глаза - решительно */}
      <path d="M17 27.5l8.5 1.6M40 29l7.5-2" stroke="#3A2206" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M19.5 34h6.5M38.5 34h6.5" stroke="#3A2206" strokeWidth="3" strokeLinecap="round" />
      <path d="M26 45.5h12" stroke="#3A2206" strokeWidth="2.6" strokeLinecap="round" />
      {/* ладонь у виска: пальцы вместе касаются брови, рука уходит влево вниз */}
      <g className="qd-art-salute">
        <g transform="rotate(-32 20 20)">
          <rect x="-4" y="17" width="16" height="8.4" rx="3" fill="#FFB547" stroke="#B5600A" strokeWidth="1.2" />
          <rect x="6" y="15.4" width="24" height="10.4" rx="5.2" fill={`url(#${id}h)`} stroke="#B5600A" strokeWidth="1.3" />
          <path d="M21 18.6h7.6M21 22.6h7.6" stroke="#C9741A" strokeWidth="1.1" strokeLinecap="round" opacity="0.75" />
          <ellipse cx="15" cy="17.6" rx="6" ry="1.2" fill="#fff" opacity="0.6" />
        </g>
      </g>
      <Shine cx={20} cy={42} rx={4} ry={2.4} o={0.25} />
    </>
  );
}

function Frozen({ id }: { id: string }) {
  return (
    <>
      <g className="qd-art-shiver">
        <Face id={id} from="#B8F2FF" to="#3E8BFF" shade="#0B3A9E" />
        {/* сосульки */}
        <path d="M13 22c2-7 9-13 19-13s17 6 19 13l-2 3-1.6 6-1.8-6-2.4 2-1.6 7-2-7-2.6 1.6L36 38l-2-8-2.6 1-2 9-1.6-9-2.8.6-1.6 6.6-1.4-7-2.6-.8-1.4 5-1.3-6z" fill="#EAFBFF" stroke="#7FC8F5" strokeWidth="1" strokeLinejoin="round" opacity="0.96" />
        {/* глаза */}
        <circle cx="23" cy="34" r="2.8" fill="#0B2A66" />
        <circle cx="41" cy="34" r="2.8" fill="#0B2A66" />
        {/* стучащие зубы */}
        <rect x="21" y="41" width="22" height="9" rx="4.5" fill="#fff" stroke="#0B2A66" strokeWidth="1.6" />
        <path d="M26.5 41v9M32 41v9M37.5 41v9M21 45.5h22" stroke="#0B2A66" strokeWidth="1.2" />
      </g>
      <Spark x={56} y={14} r={4.2} fill="#DFF7FF" className="qd-art-tw" />
      <Spark x={7} y={46} r={3.4} fill="#DFF7FF" className="qd-art-tw qd-art-d2" />
    </>
  );
}

function Boom({ id }: { id: string }) {
  return (
    <>
      <Face id={id} from="#FFE6A0" to="#FFA53A" shade="#B5520A" />
      {/* взрыв над головой */}
      <g className="qd-art-boom">
        <circle cx="21" cy="13" r="8" fill="#FF7A45" stroke={EDGE} strokeWidth="1" />
        <circle cx="43" cy="12" r="8.5" fill="#FF7A45" stroke={EDGE} strokeWidth="1" />
        <circle cx="32" cy="7" r="10" fill="#FFB547" stroke={EDGE} strokeWidth="1" />
        <circle cx="26" cy="10" r="5" fill="#FFE07A" />
        <circle cx="38" cy="8" r="5.5" fill="#FFE07A" />
        <circle cx="32" cy="12" r="4" fill="#FFF3C4" />
      </g>
      {/* широко открытые глаза и рот */}
      <circle cx="23" cy="32" r="5" fill="#fff" stroke="#3A1E06" strokeWidth="1.4" />
      <circle cx="41" cy="32" r="5" fill="#fff" stroke="#3A1E06" strokeWidth="1.4" />
      <circle cx="23" cy="32" r="2" fill="#3A1E06" />
      <circle cx="41" cy="32" r="2" fill="#3A1E06" />
      <ellipse cx="32" cy="46" rx="5" ry="6" fill="#5A1A0A" />
      <ellipse cx="32" cy="49" rx="3" ry="2" fill="#FF6B6B" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Реакции: «Тёплые»

const HEART = 'M32 54C18 45 9 37 9 26.5 9 19.6 14.4 14 21 14c4.6 0 8.6 2.6 11 6.4C34.4 16.6 38.4 14 43 14c6.6 0 12 5.6 12 12.5C55 37 46 45 32 54z';

function heartAt(x: number, y: number, s: number) {
  return `translate(${x} ${y}) scale(${s}) translate(-32 -34)`;
}

function InLove({ id }: { id: string }) {
  return (
    <>
      <Face id={id} from="#FFE2B8" to="#FFA066" shade="#B2481A" />
      <defs>
        <radialGradient id={`${id}h`} cx="35%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FF9AB5" />
          <stop offset="1" stopColor="#E8174F" />
        </radialGradient>
      </defs>
      <g className="qd-art-beat">
        <path d={HEART} transform={heartAt(22, 29, 0.32)} fill={`url(#${id}h)`} stroke="#A60D38" strokeWidth="3" />
        <path d={HEART} transform={heartAt(42, 29, 0.32)} fill={`url(#${id}h)`} stroke="#A60D38" strokeWidth="3" />
      </g>
      <path d="M21 41c4 7 18 7 22 0-6 2.4-16 2.4-22 0z" fill="#7A1E12" stroke="#5A140C" strokeWidth="1.2" strokeLinejoin="round" />
      <circle cx="15" cy="38" r="3.4" fill="#FF6B8B" opacity="0.45" />
      <circle cx="49" cy="38" r="3.4" fill="#FF6B8B" opacity="0.45" />
      <Shine cx={22} cy={17} rx={8} ry={4} o={0.55} />
    </>
  );
}

function Hug({ id }: { id: string }) {
  return (
    <>
      <Face id={id} from="#FFE2B8" to="#FFA066" shade="#B2481A" />
      <path d="M17 30c2-3 6-3 8 0M39 30c2-3 6-3 8 0" fill="none" stroke="#4A2410" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M25 41c3 3.4 11 3.4 14 0" fill="none" stroke="#4A2410" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="17" cy="37" rx="4.4" ry="3" fill="#FF5C8A" opacity="0.5" />
      <ellipse cx="47" cy="37" rx="4.4" ry="3" fill="#FF5C8A" opacity="0.5" />
      <g className="qd-art-float">
        <path d={HEART} transform={heartAt(53, 13, 0.24)} fill="#FF4F7B" stroke="#A60D38" strokeWidth="3" />
      </g>
      <g className="qd-art-float qd-art-d2">
        <path d={HEART} transform={heartAt(9, 16, 0.18)} fill="#FF7A9C" stroke="#A60D38" strokeWidth="3" />
      </g>
      <g className="qd-art-float qd-art-d3">
        <path d={HEART} transform={heartAt(56, 41, 0.16)} fill="#FF9AB5" stroke="#A60D38" strokeWidth="3" />
      </g>
      <Shine cx={22} cy={17} rx={8} ry={4} o={0.55} />
    </>
  );
}

function Heart({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}h`} cx="35%" cy="28%" r="80%">
          <stop offset="0" stopColor="#FFB3CC" />
          <stop offset="0.55" stopColor="#FF4F8B" />
          <stop offset="1" stopColor="#C2105A" />
        </radialGradient>
      </defs>
      <g className="qd-art-beat">
        <path d={HEART} transform="translate(0 -2)" fill={`url(#${id}h)`} stroke={EDGE} strokeWidth="1.2" />
        <path d="M17 24c1-4.4 4.4-6.6 8-6.6" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round" opacity="0.75" />
      </g>
      <Spark x={52} y={10} r={5} fill="#FFF0F6" className="qd-art-tw" />
      <Spark x={9} y={44} r={3.6} fill="#FFF0F6" className="qd-art-tw qd-art-d2" />
      <Spark x={45} y={44} r={2.6} fill="#fff" className="qd-art-tw qd-art-d3" />
    </>
  );
}

function Deal({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE2B8" />
          <stop offset="1" stopColor="#FFA066" />
        </linearGradient>
      </defs>
      <g className="qd-art-shake">
        {/* рукава: мой - синий, соперника - оранжевый */}
        <path d="M2 41l9-12 9 7-8 11z" fill="#4F8DFF" stroke="#1E4FB8" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M62 41l-9-12-9 7 8 11z" fill="#FF8A3D" stroke="#B14E0C" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M9.5 31l8.6 6.6M54.5 31l-8.6 6.6" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
        {/* кисть снизу (моя) */}
        <path d="M18 36c4-6 10-9 16-8l9 1.6c2 .4 2.4 3 .6 4l-7 3.6 5.6 4.4c1.6 1.2.8 3.8-1.2 3.8H29c-4 0-7.6-1.6-10.4-4.4z" fill={`url(#${id}k)`} stroke="#B2481A" strokeWidth="1.3" strokeLinejoin="round" />
        {/* кисть сверху (соперника) - пальцы обхватывают */}
        <path d="M46 36c-3-6-9-9.6-15-9.6-2.4 0-4.6 1-6.2 2.6l-3.4 3.6c-1.2 1.4.4 3.4 2 2.6l5.2-2.4c3 4 6.4 7 10.4 8.4l2.6.8z" fill={`url(#${id}k)`} stroke="#B2481A" strokeWidth="1.3" strokeLinejoin="round" />
        <path d="M33.4 32.4l4.6 3.8M36.4 30.4l4.8 3.8M39.4 28.8l4 3.4" stroke="#B2481A" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
        <ellipse cx="30" cy="29" rx="4.4" ry="1.4" fill="#fff" opacity="0.6" transform="rotate(-14 30 29)" />
      </g>
      <path d="M32 9v6M22 12l3 5M42 12l-3 5" stroke="#FFD36B" strokeWidth="2.6" strokeLinecap="round" className="qd-art-tw" />
    </>
  );
}

function Thanks({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}r`} cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#FFE07A" stopOpacity="0.9" />
          <stop offset="1" stopColor="#FFB020" stopOpacity="0" />
        </radialGradient>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFE2B8" />
          <stop offset="1" stopColor="#FFA066" />
        </linearGradient>
      </defs>
      <g className="qd-art-rays">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <path key={a} d="M32 2l2.4 9h-4.8z" fill="#FFD36B" opacity="0.75" transform={`rotate(${a} 32 30)`} />
        ))}
      </g>
      <circle cx="32" cy="30" r="18" fill={`url(#${id}r)`} />
      {/* ладони */}
      <path d="M31 12c-2 0-3.4 1.6-3.6 3.6L25 37l-6 6c-1.4 1.4-1.4 3.6 0 5l5 5c1.4 1.4 3.6 1.4 5 0l3-3z" fill={`url(#${id}p)`} stroke="#B2481A" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M33 12c2 0 3.4 1.6 3.6 3.6L39 37l6 6c1.4 1.4 1.4 3.6 0 5l-5 5c-1.4 1.4-3.6 1.4-5 0l-3-3z" fill={`url(#${id}p)`} stroke="#B2481A" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M32 14v36" stroke="#B2481A" strokeWidth="1.2" opacity="0.7" />
      <ellipse cx="28.6" cy="22" rx="1.4" ry="4.4" fill="#fff" opacity="0.55" />
    </>
  );
}

function Touched({ id }: { id: string }) {
  return (
    <>
      <Face id={id} from="#FFE2B8" to="#FFA066" shade="#B2481A" />
      {/* огромные блестящие глаза */}
      <circle cx="23" cy="30" r="7" fill="#2A1640" />
      <circle cx="41" cy="30" r="7" fill="#2A1640" />
      <circle cx="25.4" cy="27.4" r="2.6" fill="#fff" />
      <circle cx="43.4" cy="27.4" r="2.6" fill="#fff" />
      <circle cx="21" cy="32.6" r="1.3" fill="#fff" opacity="0.9" />
      <circle cx="39" cy="32.6" r="1.3" fill="#fff" opacity="0.9" />
      <path d="M16 36.5c4 2 10 2 14 0M34 36.5c4 2 10 2 14 0" fill="none" stroke="#7FD4FF" strokeWidth="2" strokeLinecap="round" opacity="0.85" />
      {/* дрожащая улыбка */}
      <path d="M25 46c2-1.6 3.4 1.2 5 0s3.4 1.2 5 0 3.4 1.2 4.6 0" fill="none" stroke="#4A2410" strokeWidth="2.2" strokeLinecap="round" />
      {/* слеза */}
      <path className="qd-art-tear" d="M44 38c2 3 3 4.6 3 6a3 3 0 0 1-6 0c0-1.4 1-3 3-6z" fill="#7FD4FF" stroke="#2F8FD8" strokeWidth="0.8" />
      <Shine cx={22} cy={17} rx={8} ry={4} o={0.55} />
    </>
  );
}

// ---------------------------------------------------------------------------
// Реакции: «Праздник»

function Popper({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}c`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE07A" />
          <stop offset="1" stopColor="#F59E0B" />
        </linearGradient>
      </defs>
      {/* конфетти */}
      <g className="qd-art-pop">
        <rect x="38" y="6" width="5" height="9" rx="1.5" fill="#22D3EE" transform="rotate(25 40 10)" />
        <rect x="50" y="17" width="5" height="9" rx="1.5" fill="#FF5FA2" transform="rotate(-30 52 21)" />
        <rect x="27" y="9" width="4" height="8" rx="1.5" fill="#9B5CFF" transform="rotate(-20 29 13)" />
        <circle cx="54" cy="35" r="3" fill="#3BE58B" />
        <circle cx="47" cy="10" r="2.4" fill="#FFD36B" />
        <circle cx="36" cy="22" r="2.2" fill="#fff" />
        <path d="M30 26c4-6 10-5 13-10M38 31c6-2 9 2 15-1" fill="none" stroke="#FF5FA2" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      {/* хлопушка */}
      <path d="M7 57l13-33 20 20z" fill={`url(#${id}c)`} stroke="#B2480A" strokeWidth="1.3" strokeLinejoin="round" />
      <path d="M12 44l9 9M16 34l14 14" stroke="#9B5CFF" strokeWidth="3.2" strokeLinecap="round" />
      <ellipse cx="30" cy="34" rx="14" ry="5" transform="rotate(45 30 34)" fill="#FFF3C4" stroke="#B2480A" strokeWidth="1.2" />
      <Shine cx={14} cy={42} rx={2} ry={7} o={0.4} rot={22} />
    </>
  );
}

function Party({ id }: { id: string }) {
  return (
    <>
      <Face id={id} from="#FFE6A0" to="#FFB23F" shade="#B5600A" />
      {/* колпак */}
      <path d="M17 17L28 1l7 19z" fill="#FF5FA2" stroke="#B3123A" strokeWidth="1.2" strokeLinejoin="round" transform="rotate(-18 26 12)" />
      <path d="M21.5 12.5l9 2.4M24 6l5 1.4" stroke="#22D3EE" strokeWidth="2.6" strokeLinecap="round" transform="rotate(-18 26 12)" />
      <circle cx="22.4" cy="2.4" r="3" fill="#FFD36B" stroke={EDGE} strokeWidth="0.8" />
      {/* глаза-улыбки */}
      <path d="M19 30c2-3 6-3 8 0M37 28c2-3 6-3 8 0" fill="none" stroke="#3A2206" strokeWidth="2.6" strokeLinecap="round" />
      {/* дудка */}
      <g className="qd-art-horn">
        <path d="M30 44l14 2" stroke="#9B5CFF" strokeWidth="4" strokeLinecap="round" />
        <path d="M44 46c6 .8 11 0 13-4 1.6-3.4-1.4-6-4-4.4-2.4 1.4-1 4.4 1 3.6" fill="none" stroke="#22D3EE" strokeWidth="3.4" strokeLinecap="round" />
      </g>
      <circle cx="27" cy="44" r="3.2" fill="#7A3A0A" />
      <circle cx="11" cy="12" r="2.2" fill="#22D3EE" className="qd-art-tw" />
      <circle cx="55" cy="16" r="2.4" fill="#3BE58B" className="qd-art-tw qd-art-d2" />
      <circle cx="9" cy="48" r="2" fill="#FF5FA2" className="qd-art-tw qd-art-d3" />
    </>
  );
}

function Bubbly({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#0F6B4A" />
          <stop offset="0.45" stopColor="#1FA874" />
          <stop offset="1" stopColor="#0A4A33" />
        </linearGradient>
      </defs>
      {/* бутылка наклонена */}
      <g transform="rotate(28 32 40)">
        <path d="M28 18h8v8c0 2 6 5 6 12v18a4 4 0 0 1-4 4H26a4 4 0 0 1-4-4V38c0-7 6-10 6-12z" fill={`url(#${id}b)`} stroke={EDGE} strokeWidth="1.2" />
        <path d="M27 18h10v9H27z" fill="#FFD24A" stroke="#B87511" strokeWidth="1" />
        <rect x="23" y="41" width="18" height="10" rx="2" fill="#FFF3C4" stroke="#B87511" strokeWidth="1" />
        <path d="M27 46h10" stroke="#C98512" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M25 31c-1 3-1 6-1 9" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
      </g>
      {/* пена и пробка */}
      <g className="qd-art-cork">
        <path d="M43 14l6-6M47 18l7-3M40 11l1-7" stroke="#FFF7DA" strokeWidth="2.6" strokeLinecap="round" />
        <circle cx="49" cy="7" r="2.4" fill="#FFF7DA" />
        <circle cx="56" cy="14" r="2" fill="#FFF7DA" />
        <rect x="50" y="1" width="7" height="6" rx="2" fill="#E8B15A" stroke="#9A5A12" strokeWidth="1" transform="rotate(30 53 4)" />
      </g>
    </>
  );
}

function Bullseye({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}t`} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#fff" stopOpacity="0.5" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="30" cy="34" r="24" fill="#FF3B5C" stroke={EDGE} strokeWidth="1.2" />
      <circle cx="30" cy="34" r="18" fill="#FFF7F8" />
      <circle cx="30" cy="34" r="12" fill="#FF3B5C" />
      <circle cx="30" cy="34" r="6" fill="#FFF7F8" />
      <circle cx="30" cy="34" r="2.6" fill="#FF3B5C" />
      <circle cx="30" cy="34" r="24" fill={`url(#${id}t)`} />
      {/* дротик */}
      <g className="qd-art-wobble">
        <path d="M30 34L52 12" stroke="#3A3F5C" strokeWidth="3" strokeLinecap="round" />
        <path d="M49 15l3-9 2 6 6 2-9 3z" fill="#22D3EE" stroke="#0E7C95" strokeWidth="1" strokeLinejoin="round" />
        <circle cx="30" cy="34" r="2" fill="#3A3F5C" />
      </g>
    </>
  );
}

function Genius({ id }: { id: string }) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}b`} cx="38%" cy="30%" r="80%">
          <stop offset="0" stopColor="#FFC2DA" />
          <stop offset="1" stopColor="#F0569B" />
        </radialGradient>
      </defs>
      <g className="qd-art-beat">
        <path
          d="M31 12c-3-3-9-3-11 1-4-1-8 2-7.6 6.4C9 21 8 26 11 29c-2 3-1 8 3 9.4 0 4 4 6.6 8 5.6 2 3 7 3.4 9 .6V12zM33 12c3-3 9-3 11 1 4-1 8 2 7.6 6.4 3.4 1.6 4.4 6.6 1.4 9.6 2 3 1 8-3 9.4 0 4-4 6.6-8 5.6-2 3-7 3.4-9 .6V12z"
          fill={`url(#${id}b)`}
          stroke="#A0175A"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path d="M20 18c3 1 4 3 3.4 6M15 28c3-1 6 0 7 3M25 36c-2-2-5-2-7 0M44 18c-3 1-4 3-3.4 6M49 28c-3-1-6 0-7 3M39 36c2-2 5-2 7 0" fill="none" stroke="#A0175A" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
        <ellipse cx="21" cy="17" rx="4" ry="2.2" fill="#fff" opacity="0.6" transform="rotate(-20 21 17)" />
      </g>
      {/* искры */}
      <path className="qd-art-tw" d="M55 46l-5 6h4l-3 6 7-8h-4l2-4z" fill="#FFD36B" stroke="#B87511" strokeWidth="0.8" strokeLinejoin="round" />
      <path className="qd-art-tw qd-art-d2" d="M9 46l-4 5h3l-2.4 5 5.6-6.4h-3.2l1.6-3.6z" fill="#FFD36B" stroke="#B87511" strokeWidth="0.8" strokeLinejoin="round" />
      <path d="M32 12v32" stroke="#A0175A" strokeWidth="1.2" opacity="0.6" />
    </>
  );
}

function Crown({ id }: { id: string }) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFF0A8" />
          <stop offset="0.5" stopColor="#FFC93D" />
          <stop offset="1" stopColor="#E08A0B" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="22" ry="4" fill="#000" opacity="0.16" />
      <path d="M8 22l12 10 12-18 12 18 12-10-5 26H13z" fill={`url(#${id}g)`} stroke="#A8620A" strokeWidth="1.3" strokeLinejoin="round" />
      <rect x="12" y="44" width="40" height="8" rx="3" fill={`url(#${id}g)`} stroke="#A8620A" strokeWidth="1.2" />
      <circle cx="8" cy="21" r="3.4" fill="#FFD24A" stroke="#A8620A" strokeWidth="1" />
      <circle cx="32" cy="12" r="3.6" fill="#FFD24A" stroke="#A8620A" strokeWidth="1" />
      <circle cx="56" cy="21" r="3.4" fill="#FFD24A" stroke="#A8620A" strokeWidth="1" />
      <circle cx="22" cy="48" r="2.6" fill="#FF3B5C" stroke="#8C0C26" strokeWidth="0.8" />
      <circle cx="32" cy="48" r="3" fill="#3F86FF" stroke="#13398C" strokeWidth="0.8" />
      <circle cx="42" cy="48" r="2.6" fill="#3BE58B" stroke="#0E6B3A" strokeWidth="0.8" />
      <path d="M32 26l3 5-3 5-3-5z" fill="#FF5FA2" stroke="#8C0C46" strokeWidth="0.8" />
      <path d="M15 28l4 12M25 32l2 8" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <Spark x={50} y={8} r={4.4} fill="#FFF6C8" className="qd-art-tw" />
      <Spark x={14} y={9} r={3} fill="#FFF6C8" className="qd-art-tw qd-art-d2" />
    </>
  );
}

const DRAWN: Record<string, (p: { id: string }) => ReactNode> = {
  '😎': Cool,
  '🤡': Clown,
  '💀': Skull,
  '🫡': Salute,
  '🥶': Frozen,
  '🤯': Boom,
  '😍': InLove,
  '🥰': Hug,
  '💖': Heart,
  '🤝': Deal,
  '🙏': Thanks,
  '🥹': Touched,
  '🎉': Popper,
  '🥳': Party,
  '🍾': Bubbly,
  '🎯': Bullseye,
  '🧠': Genius,
  '👑': Crown,
};

/** Есть ли у реакции свой рисунок (платные наборы). */
export const isDrawnReaction = (r: string) => r in DRAWN;

/** Свой рисунок реакции; для базовых эмодзи - null. */
export function ReactionArt({ r, size = 32, live = false }: { r: string; size?: number; live?: boolean }) {
  const uid = useUid();
  const Draw = DRAWN[r];
  if (!Draw) return null;
  return (
    <Svg size={size} live={live}>
      <Draw id={uid} />
    </Svg>
  );
}

/**
 * Реакция как её видит игрок: нарисованная для платных наборов, эмодзи - для базового.
 * size - сторона рисунка; эмодзи берёт ~72% от неё (эмодзи визуально крупнее рисунка с полями).
 */
export function ReactionGlyph({ r, size = 32, live = false, style }: { r: string; size?: number; live?: boolean; style?: CSSProperties }) {
  if (isDrawnReaction(r)) return <ReactionArt r={r} size={size} live={live} />;
  return (
    <span className="qd-emoji leading-none" style={{ fontSize: Math.round(size * 0.72), ...style }}>
      {r}
    </span>
  );
}
