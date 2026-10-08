// Downloads the open (OFL) Noto fonts used for burned-in subtitles and template text,
// so videos look the same on any server. Runs before `next build`; skips files already there.
import fs from "fs";
import path from "path";

const BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl";
// static Regular: the variable CJK fonts default to Thin
const CJK = "https://raw.githubusercontent.com/notofonts/noto-cjk/main/Sans/SubsetOTF";
const FONTS = {
  "NotoSans.ttf": "notosans/NotoSans%5Bwdth,wght%5D.ttf",
  "NotoSansSC.otf": "{cjk}/SC/NotoSansSC-Regular.otf",
  "NotoSansTC.otf": "{cjk}/TC/NotoSansTC-Regular.otf",
  "NotoSansJP.otf": "{cjk}/JP/NotoSansJP-Regular.otf",
  "NotoSansKR.otf": "{cjk}/KR/NotoSansKR-Regular.otf",
  "NotoSansArabic.ttf": "notosansarabic/NotoSansArabic%5Bwdth,wght%5D.ttf",
  "NotoSansDevanagari.ttf": "notosansdevanagari/NotoSansDevanagari%5Bwdth,wght%5D.ttf",
  "NotoSansLao.ttf": "notosanslao/NotoSansLao%5Bwdth,wght%5D.ttf",
  "NotoSansMyanmar.ttf": "notosansmyanmar/NotoSansMyanmar%5Bwdth,wght%5D.ttf",
};

const dir = path.join(process.cwd(), "assets", "fonts");
fs.mkdirSync(dir, { recursive: true });
await Promise.all(Object.entries(FONTS).map(async ([name, src]) => {
  const file = path.join(dir, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  const res = await fetch(src.startsWith("{cjk}") ? src.replace("{cjk}", CJK) : `${BASE}/${src}`);
  if (!res.ok) throw new Error(`Couldn't download ${name}: ${res.status}`);
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  console.log(`[fonts] ${name}`);
}));
