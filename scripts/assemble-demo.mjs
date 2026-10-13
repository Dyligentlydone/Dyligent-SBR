// Assembles the final demo cut: converts scene .webm clips to mp4, generates
// VO per scene (macOS say), renders the closing card, concatenates, and mixes
// the VO in at each scene's start. Run after scripts/record-demo.mjs.
//
// Usage: node scripts/assemble-demo.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const OUT = "uploaded content/demo-video";
const TMP = path.join(OUT, ".tmp");
const FINAL = path.join(OUT, "dyligent-demo.mp4");
const VOICE = "Zoe (Premium)";
const WPM = "178";
const VO_LEAD_IN = 0.6; // seconds after each scene starts before VO begins
const CARD_SECONDS = 6;

// The whole pitch lives here — one line per scene, timed to its clip.
const SCENES = [
  {
    clip: "01-landing",
    vo: "Every day, homeowners with money to spend are emailing contractors — and booking whoever answers first. Most of those emails sit unanswered for hours. That's not a lead problem. That's a leak.",
  },
  {
    clip: "02-login",
    vo: "Dyligent SDR plugs it. Sign up, connect your inbox — it starts working the same day.",
  },
  {
    clip: "03-dashboard",
    vo: "New email lands? It's a lead instantly — parsed, deduplicated, and in your pipeline.",
  },
  {
    clip: "04-leads",
    vo: "Five minutes later — while you're on a roof, under a house, elbow deep in a job — it's already texting and emailing that lead back. In your voice.",
  },
  {
    clip: "05-review-queue",
    vo: "You approve every message with one tap — or flip on auto-send and let it run.",
  },
  {
    clip: "06-settings",
    vo: "It already sounds like your shop — it learned your services, your area, your voice from your website. And every booking, every edit, every conversation makes it smarter for the next one. Free until it books you two real jobs.",
  },
];

mkdirSync(TMP, { recursive: true });
const run = (bin, args) => execFileSync(bin, args, { stdio: "inherit" });

const probe = (f) =>
  parseFloat(
    execFileSync("ffprobe", [
      "-v", "quiet", "-show_entries", "format=duration",
      "-of", "csv=p=0", f,
    ]).toString(),
  );

// 1. webm → mp4 (uniform codec for concat)
for (const s of SCENES) {
  const src = path.join(OUT, `${s.clip}.webm`);
  const dst = path.join(OUT, `${s.clip}.mp4`);
  run("ffmpeg", ["-y", "-i", src, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", dst]);
  s.dur = probe(dst);
  console.log(`${s.clip}: ${s.dur.toFixed(1)}s`);
}

// 2. closing card — navy, gold logo, tagline (screenshot via playwright)
const logoB64 = readFileSync("public/logo.png").toString("base64");
const cardHtml = `<body style="margin:0;width:1440px;height:900px;background:#1E3A8A;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,sans-serif">
  <img src="data:image/png;base64,${logoB64}" style="width:200px">
  <div style="color:#D4A017;font-size:44px;font-weight:700;margin-top:32px">Your pipeline. Leak-proof.</div>
  <div style="color:#F97316;font-size:22px;margin-top:16px">Free until it books you 2 jobs.</div>
</body>`;
const browser = await chromium.launch();
const cardPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await cardPage.setContent(cardHtml);
await cardPage.screenshot({ path: path.join(TMP, "card.png") });
await browser.close();
run("ffmpeg", [
  "-y", "-loop", "1", "-t", String(CARD_SECONDS), "-i", path.join(TMP, "card.png"),
  "-vf", "scale=1440:900", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", "30",
  path.join(TMP, "card.mp4"),
]);
SCENES.push({ clip: "card", vo: "Your pipeline. Leak-proof.", dur: CARD_SECONDS, card: true });

// 3. concat video + fade-out on the card
writeFileSync(
  path.join(TMP, "list.txt"),
  SCENES.map((s) => `file '${path.resolve(s.card ? path.join(TMP, "card.mp4") : path.join(OUT, s.clip + ".mp4"))}'`).join("\n"),
);
const total = SCENES.reduce((a, s) => a + s.dur, 0);
run("ffmpeg", [
  "-y", "-f", "concat", "-safe", "0", "-i", path.join(TMP, "list.txt"),
  "-vf", `fade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5`,
  "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20", path.join(TMP, "video.mp4"),
]);

// 4. VO per scene, delayed to its start, mixed into one track
let offset = 0;
const voInputs = [];
for (const [i, s] of SCENES.entries()) {
  const aiff = path.join(TMP, `vo-${i}.aiff`);
  const wav = path.join(TMP, `vo-${i}.wav`);
  run("say", ["-v", VOICE, "-r", WPM, "-o", aiff, s.vo]);
  run("ffmpeg", ["-y", "-i", aiff, wav]);
  voInputs.push(wav);
  s.voStart = offset + VO_LEAD_IN;
  offset += s.dur;
}
const mixInputs = voInputs.flatMap((f) => ["-i", f]);
const delays = SCENES.map((s, i) => `[${i + 1}:a]adelay=${Math.round(s.voStart * 1000)}|${Math.round(s.voStart * 1000)}[d${i}]`);
const mixIn = SCENES.map((_, i) => `[d${i}]`).join("");
run("ffmpeg", [
  "-y", "-i", path.join(TMP, "video.mp4"), ...mixInputs,
  "-filter_complex",
  `${delays.join(";")};${mixIn}amix=inputs=${SCENES.length}:normalize=0,afade=t=out:st=${(total - 1.5).toFixed(2)}:d=1.5[a]`,
  "-map", "0:v", "-map", "[a]",
  "-c:v", "copy", "-c:a", "aac", "-shortest",
  FINAL,
]);

console.log(`\n${FINAL} — ${total.toFixed(1)}s total`);
console.log("\nScene start times (for DEMO-SCRIPT.md):");
offset = 0;
for (const s of SCENES) {
  const m = Math.floor(offset / 60), sec = Math.round(offset % 60);
  console.log(`  ${m}:${String(sec).padStart(2, "0")}  ${s.clip}`);
  offset += s.dur;
}
