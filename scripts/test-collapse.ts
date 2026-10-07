// Quick check for collapseRepeats. Run: npx tsx scripts/test-collapse.ts
import { collapseRepeats } from "../src/domain/use-cases/ProcessTranslationJob";
const seg = (start: number, end: number, text: string, speaker = "Speaker 0") => ({ start, end, text, speaker });
const input = [seg(19.44, 21.04, "我穿越啦"), seg(23.04, 24.04, "我穿越啦"), ...Array.from({ length: 11 }, (_, i) => seg(24.04 + i * 0.5, 24.56 + i * 0.5, "我穿越啦")), seg(30.12, 30.56, "这")];
const out = collapseRepeats(input);
console.log(out.map((s) => `${s.start.toFixed(2)}-${s.end.toFixed(2)} ${s.text}`).join("\n"));
if (out.length !== 3) { console.error("expected 3 lines, got", out.length); process.exit(1); }
console.log("ok");
