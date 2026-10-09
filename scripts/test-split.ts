// Tries Auto-split's media steps on a local video: npx tsx scripts/test-split.ts <video>
import path from "path";
import { FFmpegMediaRepository } from "../src/data/repositories/FFmpegMediaRepository";
import { planParts, snapToPauses, splitEstimate, DEFAULT_SPLIT } from "../src/domain/split/Split";
import { partTemplate } from "../src/domain/use-cases/SplitVideo";

(async () => {
  const input = path.resolve(process.argv[2] ?? "scripts/out/split-test/in.mp4");
  const out = path.resolve("scripts/out/split-test");
  const m = new FFmpegMediaRepository();
  const info = await m.probe(input);
  const s = { ...DEFAULT_SPLIT, len: 15 };
  const planned = planParts(info.durationSec, s);
  const pauses = await m.findPauses(input);
  const parts = snapToPauses(planned, pauses);
  console.log(`duration ${info.durationSec.toFixed(1)}s · ${pauses.length} pauses · price ${splitEstimate(info.durationSec, s, false).total} cr`);
  parts.forEach((p, i) => console.log(`part ${i + 1}: ${p.from.toFixed(2)} → ${p.to.toFixed(2)} (planned cut ${planned[i].to.toFixed(2)})`));

  let t = Date.now();
  await m.cut(input, parts[1].from, parts[1].to, path.join(out, "cut-2.mp4"));
  console.log("plain cut", Date.now() - t, "ms", (await m.probe(path.join(out, "cut-2.mp4"))).durationSec.toFixed(2) + "s");

  t = Date.now();
  await m.render(input, input, path.join(out, "enc-2.mp4"), { startSec: parts[1].from, trimSec: parts[1].to - parts[1].from, template: partTemplate(s, null, 1, parts.length) });
  const enc = await m.probe(path.join(out, "enc-2.mp4"));
  console.log("re-encoded 9:16 + label", Date.now() - t, "ms", `${enc.width}x${enc.height}`, enc.durationSec.toFixed(2) + "s", "audio:", enc.hasAudio);
})().catch((e) => { console.error(String(e).slice(0, 1500)); process.exit(1); });
