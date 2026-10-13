# Dyligent SDR — Demo Walkthrough

`dyligent-demo.mp4` — final cut, 92s, 1440×900, voiceover baked in
(macOS "Zoe (Premium)" neural voice, 178 wpm). Scene clips are also included
individually if you want to re-cut.

## VO script (as recorded)

| Time | Scene | Line |
|---|---|---|
| 0:01 | Landing | "Every day, homeowners with money to spend are emailing contractors — and booking whoever answers first. Most of those emails sit unanswered for hours. That's not a lead problem. That's a leak." |
| 0:20 | Login | "Dyligent SDR plugs it. Sign up, connect your inbox — it starts working the same day." |
| 0:29 | Dashboard | "New email lands? It's a lead instantly — parsed, deduplicated, and in your pipeline." |
| 0:39 | Leads | "Five minutes later — while you're on a roof, under a house, elbow deep in a job — it's already texting and emailing that lead back. In your voice." |
| 0:55 | Review queue | "You approve every message with one tap — or flip on auto-send and let it run." |
| 1:04 | Settings | "It already sounds like your shop — it learned your services, your area, your voice from your website. And every booking, every edit, every conversation makes it smarter for the next one. Free until it books you two real jobs." |
| 1:26 | Closing card | "Your pipeline. Leak-proof." |

The Settings scene dwells on the "What your AI has learned" panel — the two
WON lessons on camera are real, distilled by the product from a booked lead's
thread. That's the differentiator beat of the whole video.

## Edit structure

Hard cuts between scenes, fade-to-black on the closing card. The card is
brand navy with the gold logo lockup — "Your pipeline. Leak-proof." /
"Free until it books you 2 jobs."

## If you want to re-voice it yourself

Say each line over its scene clip — timings above are where each scene
starts, and each line has ~8s of headroom before the next cut. Record in
one take and slice, or drop me your audio and I'll lay it in.

## Regenerating

- Record clips: `node scripts/record-demo.mjs` (dev server must be on :3001)
- Assemble final cut: `node scripts/assemble-demo.mjs` — converts clips,
  renders the closing card, generates + times all VO, outputs
  `dyligent-demo.mp4`. Edit the `SCENES` array at the top to change the script.
