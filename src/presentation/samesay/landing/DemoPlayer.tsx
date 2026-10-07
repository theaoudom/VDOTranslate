"use client";

import { useState } from "react";
import { Bars, Scene } from "./Scene";

// Sample lines for the hero demo (not real job data).
const SAMPLE_DEMO = {
  en: { label: "Original", name: "Original · English", line: "Today we're trying street food in Phnom Penh." },
  km: { label: "ខ្មែរ", name: "Khmer · same voice", line: "ថ្ងៃនេះយើងសាកល្បងម្ហូបតាមផ្លូវនៅភ្នំពេញ។" },
  zh: { label: "中文", name: "Chinese · same voice", line: "今天我们在金边尝试街头美食。" },
  vi: { label: "Tiếng Việt", name: "Vietnamese · same voice", line: "Hôm nay chúng ta thử đồ ăn đường phố ở Phnom Penh." },
};
type Lang = keyof typeof SAMPLE_DEMO;

export function DemoPlayer() {
  const [lang, setLang] = useState<Lang>("km");
  return (
    <div className="demo">
      <div className="demo-bar">
        <div className="seg" role="group">
          {(Object.keys(SAMPLE_DEMO) as Lang[]).map((l) => (
            <button key={l} aria-pressed={lang === l} onClick={() => setLang(l)}>{SAMPLE_DEMO[l].label}</button>
          ))}
        </div>
        <span style={{ flex: 1 }} />
        <span className="badge ok"><span className="dot" />Same voice</span>
      </div>
      <div className="viewer demo-stage">
        <Scene idp="hero-" />
        <span className="badge" style={{ position: "absolute", left: 10, top: 10, background: "rgba(0,0,0,.55)", color: "#fff" }}>
          <span className="dot live" style={{ color: "var(--rec)" }} />Speaker 1 · his own voice
        </span>
        <div className="subtitle">{SAMPLE_DEMO[lang].line}</div>
      </div>
      <div className="demo-waves">
        <div className="wrow"><span>Original · English</span><Bars n={56} seed={1} /></div>
        <div className="wrow dub"><span>{lang === "en" ? "Original · playing" : SAMPLE_DEMO[lang].name}</span><Bars n={56} seed={1.15} anim /></div>
      </div>
    </div>
  );
}
