import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, AudioLines, Image as ImageIcon, Music, Play, Plus, Scissors, Sparkles, Timer, Users } from "lucide-react";
import { PlanCards } from "../Plans";
import { AnchorButton } from "./AnchorButton";
import { DemoPlayer } from "./DemoPlayer";
import { Bars } from "./Scene";

const LANG_CHIPS = [["ខ្មែរ", "Khmer"], ["ລາວ", "Lao"], ["မြန်မာ", "Burmese"], ["Tiếng Việt", "Vietnamese"], ["Bahasa", "Indonesian"], ["中文", "Chinese"], ["한국어", "Korean"], ["日本語", "Japanese"], ["हिन्दी", "Hindi"], ["English", "English"], ["Español", "Spanish"], ["Français", "French"]];
const STEPS = [
  ["01", "Upload your video", "MP4, MOV or WEBM. We find the language and the speakers."],
  ["02", "See the price, then start", "Pick a language and a voice. You see the exact credits before anything runs."],
  ["03", "Check, fix and download", "Read the translated lines, fix any word, and only that line is re-voiced."],
];
const FAQ = [
  ["Will it really sound like me?", "With “Their own voice” we clone each speaker from the original audio. Clear speech gives the best result. You can also choose natural or standard AI voices, which cost less."],
  ["What if a word is translated wrong?", "Open the result, edit the line, and we re-voice only that line for 1 credit. The rest of the video stays as it is."],
  ["How much does a video cost?", "It depends on its length and the voice you choose. A 5-minute video with standard voices is about 45 credits. You see the exact price before it starts."],
  ["Which languages are supported?", "We detect the spoken language automatically and translate into Khmer, Lao, Burmese, Vietnamese, Chinese, English and 20 more."],
];
const SPEAKERS = [["S1", "Sokha", "Male · 61%", "info"], ["S2", "Vannak", "Male · 22%", ""], ["S3", "Street vendor", "Female · 17%", "accent"]];

function Pillar({ icon, title, text, children }: { icon: ReactNode; title: string; text: string; children: ReactNode }) {
  return (
    <div className="panel pillar">
      <span className="ic-box">{icon}</span>
      <h3 className="t-h3">{title}</h3>
      <p>{text}</p>
      <div className="vis">{children}</div>
    </div>
  );
}

function SegRow({ segs, color }: { segs: number[][]; color: string }) {
  return (
    <span className="segrow">
      {segs.map(([l, w]) => <span key={l} style={{ left: l + "%", width: w + "%", background: color }} />)}
    </span>
  );
}

function SecHead({ eyebrow, title, text, h1, aside }: { eyebrow: string; title: string; text?: string; h1?: boolean; aside?: ReactNode }) {
  return (
    <div className="sec-head">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2 className={h1 ? "t-h1" : "t-h2"} style={{ marginTop: 8, ...(h1 ? { maxWidth: 640 } : {}) }}>{title}</h2>
        {text && <p>{text}</p>}
      </div>
      {aside}
    </div>
  );
}

export function Landing() {
  return (
    <>
      <div className="hero2">
        <div className="wrap grid2">
          <div>
            <span className="badge accent"><Sparkles style={{ width: 12, height: 12 }} />AI video translation</span>
            <h1 style={{ marginTop: "var(--sp-5)" }}>Same voice.<br /><em>New language.</em></h1>
            <p className="lede">Translate any video and keep it sounding like the original: each speaker in their own voice, every line on time, ready to post.</p>
            <div className="hstack" style={{ gap: "var(--sp-3)" }}>
              <Link className="btn primary lg" href="/signup">Translate a video free</Link>
              <AnchorButton className="btn ghost lg" to="quality"><Play />Hear the difference</AnchorButton>
            </div>
            <div className="langs-line">
              <span>Khmer</span><span>Lao</span><span>Burmese</span><span>Vietnamese</span><span>Chinese</span><span>English</span><b>+ 20 more</b>
            </div>
          </div>
          <DemoPlayer />
        </div>
      </div>

      <div className="sec" id="quality">
        <div className="wrap">
          <SecHead h1 eyebrow="Why it sounds real" title="A translation your viewers won’t notice" text="Most dubbing tools swap in one robot voice. Samesay rebuilds the audio around the people in your video." />
          <div className="pillars">
            <Pillar icon={<AudioLines />} title="Their own voice, in a new language" text="We clone each speaker’s voice from the video, so your audience still hears you, not a stranger.">
              <div className="wrow"><span>Original</span><Bars n={40} seed={2} /></div>
              <div className="wrow dub"><span>Khmer dub</span><Bars n={40} seed={2.1} anim /></div>
            </Pillar>
            <Pillar icon={<Timer />} title="Every line lands on time" text="Each translated line starts when the original did, so the voice stays in step with the picture.">
              <div className="wrow"><span>Original</span><SegRow segs={[[0, 22], [27, 18], [50, 14], [70, 26]]} color="var(--text-3)" /></div>
              <div className="wrow"><span>Translated</span><SegRow segs={[[0, 20], [27, 19], [50, 12], [70, 24]]} color="var(--accent)" /></div>
            </Pillar>
            <Pillar icon={<Users />} title="A voice for every speaker" text="We find who is talking, tell men from women, and keep each person’s voice the same from start to finish.">
              {SPEAKERS.map(([b, name, share, tone]) => (
                <div key={b} className="hstack" style={{ flexWrap: "nowrap" }}>
                  <span className={"badge " + tone}>{b}</span>
                  <span style={{ flex: 1, fontSize: "var(--fs-sm)" }}>{name}</span>
                  <span className="faint num t-xs">{share}</span>
                </div>
              ))}
            </Pillar>
            <Pillar icon={<Music />} title="Music and sounds stay in" text="We lift the speech out and keep the background music and street sounds, so the video still feels like yours.">
              <div className="wrow"><span>Voices</span><span className="segrow"><span style={{ left: 0, width: "100%", background: "var(--accent)", opacity: 0.85 }} /></span></div>
              <div className="wrow"><span>Music &amp; sounds</span><span className="segrow"><span style={{ left: 0, width: "100%", background: "var(--track-a)", opacity: 0.55 }} /></span></div>
              <span className="faint t-xs">Only the voices are replaced.</span>
            </Pillar>
          </div>
        </div>
      </div>

      <div className="sec" id="languages">
        <div className="wrap">
          <SecHead eyebrow="Languages" title="Strong in Southeast Asia, ready for the world" text="We detect the spoken language for you. Translate into any of these, including languages most tools skip." />
          <div className="lang-cloud">
            {LANG_CHIPS.map(([native, name]) => <span key={name} className="lang-chip">{native}<small>{name}</small></span>)}
            <span className="lang-chip" style={{ color: "var(--text-3)" }}>and more</span>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="wrap">
          <SecHead eyebrow="How it works" title="From upload to post in three steps" />
          <ol className="how three">
            {STEPS.map(([n, t, d]) => <li key={n}><span className="n">{n}</span><h3 className="t-h4">{t}</h3><p>{d}</p></li>)}
          </ol>
        </div>
      </div>

      <div className="sec">
        <div className="wrap">
          <SecHead eyebrow="Ready to post" title="Finish it in the same place" />
          <div className="bento">
            <div className="panel pillar">
              <span className="ic-box"><ImageIcon /></span>
              <h3 className="t-h4">Brand templates</h3>
              <p>Design it once with your logo, text and ad clips. Apply it to every video you translate.</p>
              <div className="viewer" style={{ marginTop: "auto", aspectRatio: "21/9" }}>
                <div className="frame" />
                <div className="logo-box still" style={{ top: "10%", right: "3%", width: "10%" }}><span className="mark">S</span></div>
              </div>
            </div>
            <div className="panel pillar">
              <span className="ic-box"><Scissors /></span>
              <h3 className="t-h4">Cut it for TikTok, Reels and Shorts</h3>
              <p>Split a long video into vertical parts at natural pauses, with “Part 1/5” labels.</p>
              <div className="phones">
                {[1, 2, 3, 4, 5].map((i) => <span key={i} className="phone"><b>{i}/5</b></span>)}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="wrap">
          <SecHead eyebrow="Pricing" title="Start free. Pay only for what you translate." text="You always see the price before a job starts, and unused credits come back."
            aside={<Link href="/pricing" className="t-small">Compare plans <ArrowRight style={{ width: 14, height: 14, verticalAlign: -2 }} /></Link>} />
          <PlanCards />
        </div>
      </div>

      <div className="sec">
        <div className="wrap">
          <div className="faq" style={{ maxWidth: 820 }}>
            <h2 className="t-h2" style={{ marginBottom: "var(--sp-3)" }}>Questions</h2>
            {FAQ.map(([q, a]) => <details key={q}><summary>{q}<Plus /></summary><p>{a}</p></details>)}
          </div>
        </div>
      </div>

      <div className="sec">
        <div className="wrap">
          <div className="panel cta-band cta-glow">
            <div>
              <h2 className="t-h2">Hear your video in another language</h2>
              <p className="muted" style={{ marginTop: 6 }}>60 free credits. No card needed.</p>
            </div>
            <Link className="btn primary lg" href="/signup">Translate a video free</Link>
          </div>
        </div>
      </div>
    </>
  );
}
