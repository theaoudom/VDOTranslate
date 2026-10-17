// Renders the "Sunset beach kiss" template preview: an animated illustration, 6 s seamless loop.
// Needs @resvg/resvg-js (not a project dependency: install it next to a copy of this file).
// usage: node render-sunset-kiss-preview.mjs node_modules/ffmpeg-static/ffmpeg.exe public/templates/sunset-kiss.mp4 public/templates/sunset-kiss.jpg [still.png]
import { Resvg } from "@resvg/resvg-js";
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";

const [ffmpeg, outMp4, outPoster, still] = process.argv.slice(2);
const W = 540, H = 960, FPS = 30, SEC = 6, N = FPS * SEC;
const TAU = Math.PI * 2;
const ease = (t) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
const f = (n) => n.toFixed(2);

const HORIZON = 420, SHORE = 482, CX = 181, HIP_Y = 580, S = 1.55;
const SUN = { x: CX, y: 402, r: 40 };

function lean(p) {
  if (p < 0.22) return 0;
  if (p < 0.42) return ease((p - 0.22) / 0.2);
  if (p < 0.82) return 1;
  return 1 - ease((p - 0.82) / 0.18);
}

function frame(p) {
  const a = 1 + 8 * lean(p);
  const breathe = Math.sin(TAU * p * 2) * 0.6;
  const zoom = 1 + 0.045 * (0.5 - 0.5 * Math.cos(TAU * p));
  const sway = Math.sin(TAU * p * 3) * 1.2;

  // sea: wave lines
  let waves = "";
  for (let i = 0; i < 9; i++) {
    const y = HORIZON + 6 + i * i * 0.9 + i * 3;
    const amp = 0.6 + i * 0.25, len = 26 + i * 6, ph = TAU * p * (i % 2 ? 1 : -1) + i;
    let d = "";
    for (let x = -10; x <= 370; x += 6) d += (x === -10 ? "M" : "L") + f(x) + " " + f(y + Math.sin(x / len + ph) * amp);
    waves += `<path d="${d}" fill="none" stroke="#ffd6a0" stroke-opacity="${f(0.12 + i * 0.015)}" stroke-width="${f(0.6 + i * 0.12)}"/>`;
  }
  // sun reflection on the water
  let glints = "";
  for (let i = 0; i < 14; i++) {
    const y = HORIZON + 4 + i * 4.3;
    const w = (10 + i * 3.2) * (0.6 + 0.4 * Math.abs(Math.sin(TAU * p * 2 + i * 1.7)));
    const dx = Math.sin(TAU * p + i * 0.9) * (1 + i * 0.3);
    glints += `<rect x="${f(SUN.x - w / 2 + dx)}" y="${f(y)}" width="${f(w)}" height="${f(1.4 + i * 0.08)}" rx="1" fill="#fff1c9" opacity="${f(0.75 - i * 0.04)}"/>`;
  }
  // shoreline foam
  let foam = `M -10 ${SHORE + 10}`;
  for (let x = -10; x <= 370; x += 5) foam += ` L ${x} ${f(SHORE + Math.sin(x / 34 + TAU * p) * 2.6 + Math.sin(x / 13 - TAU * p * 2) * 1)}`;
  foam += ` L 370 ${SHORE + 10} Z`;
  // drifting sparkles in the warm air
  let sparks = "";
  for (let i = 0; i < 16; i++) {
    const u = (p + i / 16) % 1;
    const x = 30 + ((i * 97) % 300) + Math.sin(TAU * (u + i * 0.3)) * 6;
    const y = 330 - u * 140 + ((i * 53) % 60);
    sparks += `<circle cx="${f(x)}" cy="${f(y)}" r="${f(0.8 + (i % 3) * 0.5)}" fill="#fff4d6" opacity="${f(Math.sin(Math.PI * u) * 0.7)}"/>`;
  }

  const ink = "#21131b", rim = `stroke="#ffb26b" stroke-opacity=".3" stroke-width=".7"`;
  const him = `
    <g transform="translate(${f(CX - 31 * S)} ${HIP_Y}) scale(${S})">
      <g transform="rotate(${f(a)}) translate(0 ${f(breathe * 0.3)})">
        <path d="M 10 -76 C 30 -70 42 -56 46 -42" fill="none" stroke="${ink}" stroke-width="9" stroke-linecap="round"/>
        <path d="M -16 2 C -20 -20 -22 -50 -20 -70 C -18 -80 -10 -84 0 -84 C 9 -84 15 -80 16 -72 C 18 -55 14 -30 14 2 Z" fill="${ink}" ${rim}/>
        <path d="M -5 -82 L 6 -82 L 7 -93 L -4 -93 Z" fill="${ink}"/>
        <circle cx="2" cy="-104" r="15" fill="${ink}" ${rim}/>
        <path d="M 15 -108 L 19.5 -101 L 15.5 -99 Z" fill="${ink}"/>
        <ellipse cx="-1" cy="-113" rx="15" ry="8" fill="${ink}"/>
      </g>
      <path d="M 0 -6 L 36 -40 L 50 -2" fill="none" stroke="${ink}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  const her = `
    <g transform="translate(${f(CX + 31 * S)} ${HIP_Y}) scale(${-S} ${S})">
      <g transform="rotate(${f(a)}) translate(0 ${f(-breathe * 0.3)})">
        <path d="M -8 -74 C -22 -62 -31 -52 -35 -57" fill="none" stroke="${ink}" stroke-width="7" stroke-linecap="round"/>
        <g transform="rotate(${f(-a)} -35 -57)">
          <path d="M -35 -57 L -35 -65" stroke="#ffd9a8" stroke-opacity=".9" stroke-width="1"/>
          <path d="M -40 -79 L -30 -79 C -30 -70 -33 -66 -35 -65.5 C -37 -66 -40 -70 -40 -79 Z" fill="#ffe6c2" fill-opacity=".25" stroke="#ffe0b5" stroke-width=".8"/>
          <path d="M -39.6 -74 L -30.4 -74 C -30.6 -69.5 -33 -66.4 -35 -66 C -37 -66.4 -39.4 -69.5 -39.6 -74 Z" fill="#8e1830"/>
        </g>
        <path d="M -15 2 C -18 -15 -14 -35 -11 -50 C -14 -62 -14 -74 -9 -79 C -4 -82 6 -82 10 -78 C 14 -70 12 -60 9 -50 C 12 -35 14 -15 12 2 Z" fill="${ink}" ${rim}/>
        <path d="M -4 -80 L 5 -80 L 6 -91 L -3 -91 Z" fill="${ink}"/>
        <circle cx="2" cy="-101" r="14" fill="${ink}" ${rim}/>
        <path d="M 14 -104 L 18 -98.5 L 14.5 -97 Z" fill="${ink}"/>
        <path d="M -12 -110 C -5 -121 13 -120 16 -106 C 11 -111 2 -111 -2 -104 C -6 -88 ${f(-10 + sway)} -72 ${f(-21 + sway)} -58 C -28 -72 -25 -98 -12 -110 Z" fill="${ink}" ${rim}/>
      </g>
      <path d="M 0 -6 L 32 -36 L 44 -2" fill="none" stroke="${ink}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 360 640">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#5e3a6b"/><stop offset=".38" stop-color="#d4645c"/><stop offset=".78" stop-color="#f8a24c"/><stop offset="1" stop-color="#ffd78a"/>
    </linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#f3a25a"/><stop offset=".3" stop-color="#9a5f73"/><stop offset="1" stop-color="#3f3d68"/>
    </linearGradient>
    <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#d79a63"/><stop offset=".45" stop-color="#a96a48"/><stop offset="1" stop-color="#5a3730"/>
    </linearGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#fff2c2" stop-opacity=".95"/><stop offset=".25" stop-color="#ffc66e" stop-opacity=".55"/><stop offset="1" stop-color="#ff8a4a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="disk" cx=".5" cy=".42" r=".55">
      <stop offset="0" stop-color="#fffbe8"/><stop offset=".7" stop-color="#ffe2a0"/><stop offset="1" stop-color="#ffbe62"/>
    </radialGradient>
    <radialGradient id="vig" cx=".5" cy=".55" r=".75">
      <stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#1a0a14" stop-opacity=".55"/>
    </radialGradient>
    <clipPath id="above"><rect x="-20" y="-20" width="400" height="${HORIZON + 20}"/></clipPath>
  </defs>
  <g transform="translate(${CX} 430) scale(${f(zoom)}) translate(${-CX} -430)">
    <rect x="-20" y="-20" width="400" height="700" fill="url(#sky)"/>
    <ellipse cx="80" cy="150" rx="120" ry="7" fill="#ffb27a" opacity=".28"/>
    <ellipse cx="290" cy="215" rx="110" ry="5" fill="#ffc48a" opacity=".3"/>
    <ellipse cx="150" cy="285" rx="150" ry="5" fill="#ffd29a" opacity=".22"/>
    <circle cx="${SUN.x}" cy="${SUN.y}" r="${f(150 + Math.sin(TAU * p) * 6)}" fill="url(#glow)"/>
    <circle cx="${SUN.x}" cy="${SUN.y}" r="${SUN.r}" fill="url(#disk)" clip-path="url(#above)"/>
    <rect x="-20" y="${HORIZON}" width="400" height="${SHORE - HORIZON + 20}" fill="url(#sea)"/>
    <rect x="-20" y="${HORIZON - 0.5}" width="400" height="1.5" fill="#ffe3a8" opacity=".8"/>
    ${glints}${waves}
    <rect x="-20" y="${SHORE}" width="400" height="200" fill="url(#sand)"/>
    <path d="${foam}" fill="#fff0dc" opacity=".55"/>
    <ellipse cx="${CX}" cy="${HIP_Y + 4}" rx="118" ry="11" fill="#2a1418" opacity=".45"/>
    ${him}${her}
    ${sparks}
  </g>
  <rect width="360" height="640" fill="url(#vig)"/>
</svg>`;
}

const png = (p) => new Resvg(frame(p), { fitTo: { mode: "original" } }).render().asPng();

if (still) { writeFileSync(still, png(0.6)); process.exit(0); }

const enc = spawn(ffmpeg, ["-y", "-f", "image2pipe", "-framerate", String(FPS), "-i", "-", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "slow", "-crf", "24", "-movflags", "+faststart", "-an", outMp4], { stdio: ["pipe", "inherit", "inherit"] });
for (let i = 0; i < N; i++) {
  if (!enc.stdin.write(png(i / N))) await new Promise((r) => enc.stdin.once("drain", r));
}
enc.stdin.end();
await new Promise((r) => enc.on("close", r));
// poster: the kiss
const posterPng = outPoster.replace(/\.jpg$/, ".tmp.png");
writeFileSync(posterPng, png(0.6));
await new Promise((r) => spawn(ffmpeg, ["-y", "-loglevel", "error", "-i", posterPng, "-q:v", "4", outPoster], { stdio: "inherit" }).on("close", r));
