import type { CSSProperties } from "react";

// Street-food scene used as the sample video frame (ported from the prototype's SCENE).
// `idp` keeps gradient/filter ids unique when the scene appears more than once.
const BOKEH: [number, number, number, string, number][] = [
  [60, 70, 14, "#ffb020", 0.5], [140, 40, 10, "#ffd27a", 0.45], [520, 60, 16, "#ffb020", 0.45], [590, 120, 11, "#ff8a3d", 0.4],
  [460, 30, 9, "#ffd27a", 0.5], [90, 160, 12, "#ff8a3d", 0.3], [560, 200, 13, "#ffb020", 0.25], [230, 120, 8, "#ffd27a", 0.3],
];
const BULBS: [number, number][] = [[40, 58], [110, 72], [180, 76], [250, 68], [320, 60], [390, 62], [460, 70], [530, 72], [600, 69]];

export function Scene({ idp }: { idp: string }) {
  const id = (n: string) => idp + n;
  const url = (n: string) => `url(#${idp}${n})`;
  return (
    <svg viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id={id("sky")} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#1b2631" /><stop offset="1" stopColor="#2a1d16" /></linearGradient>
        <filter id={id("bk")}><feGaussianBlur stdDeviation="7" /></filter>
        <radialGradient id={id("glow")} cx=".5" cy=".5" r=".5"><stop offset="0" stopColor="#ffb020" stopOpacity=".45" /><stop offset="1" stopColor="#ffb020" stopOpacity="0" /></radialGradient>
      </defs>
      <rect width="640" height="360" fill={url("sky")} />
      <g filter={url("bk")}>
        {BOKEH.map(([cx, cy, r, f, o], i) => <circle key={i} cx={cx} cy={cy} r={r} fill={f} opacity={o} />)}
      </g>
      <path d="M0 50 Q160 90 320 60 T640 70" stroke="#3a2c20" strokeWidth="2" fill="none" />
      {BULBS.map(([x, y], i) => <circle key={i} cx={x} cy={y + 5} r="4" fill="#ffcf70" />)}
      <ellipse cx="320" cy="250" rx="220" ry="130" fill={url("glow")} />
      <path d="M200 360 C205 300 245 272 320 272 C395 272 435 300 440 360 Z" fill="#2f5d62" />
      <path d="M292 272 L320 304 L348 272 Z" fill="#244a4e" />
      <rect x="303" y="236" width="34" height="42" rx="12" fill="#b07552" />
      <ellipse cx="274" cy="202" rx="8" ry="12" fill="#b9805a" />
      <ellipse cx="366" cy="202" rx="8" ry="12" fill="#b9805a" />
      <ellipse cx="320" cy="196" rx="46" ry="54" fill="#c68a62" />
      <path d="M272 192 C266 140 300 126 324 128 C358 128 376 150 370 190 C362 170 348 160 330 157 C310 168 290 174 272 192 Z" fill="#1b1410" />
      <ellipse cx="302" cy="200" rx="4" ry="5" fill="#1b1410" />
      <ellipse cx="338" cy="200" rx="4" ry="5" fill="#1b1410" />
      <path d="M293 187 q9 -5 18 0 M329 187 q9 -5 18 0" stroke="#1b1410" strokeWidth="3" fill="none" strokeLinecap="round" />
      <ellipse className="mouth" cx="320" cy="227" rx="11" ry="6" fill="#5a2a22" />
      <rect x="352" y="300" width="8" height="14" rx="3" fill="#111" />
      <rect x="0" y="318" width="640" height="42" fill="#1a130e" />
      <path d="M485 300 q-10 -20 0 -40 q10 -20 0 -40 M515 300 q-10 -20 0 -40 q10 -20 0 -40" stroke="#fff" strokeOpacity=".18" strokeWidth="4" fill="none" strokeLinecap="round" />
      <ellipse cx="500" cy="318" rx="60" ry="12" fill="#e9e2d6" />
      <path d="M440 318 Q500 360 560 318 Z" fill="#d8cfc0" />
    </svg>
  );
}

/** Waveform bars; deterministic so server and client render the same heights. */
export function Bars({ n, seed, anim }: { n: number; seed: number; anim?: boolean }) {
  return (
    <span className="bars">
      {Array.from({ length: n }, (_, i) => {
        const v = 0.25 + Math.abs(Math.sin(i * 1.7 + seed) * Math.cos(i * 0.43 + seed * 2)) * 0.75;
        const style: Record<string, string> = { height: Math.round(v * 100) + "%" };
        if (anim) style["--d"] = "-" + ((i * 97) % 1200) / 1000 + "s";
        return <i key={i} style={style as CSSProperties} />;
      })}
    </span>
  );
}
