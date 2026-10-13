# Dyligent SDR — Demo Walkthrough

`dyligent-demo.mp4` — final cut, 88s, 1440×900, voiceover baked in
(macOS "Zoe (Premium)" neural voice, 178 wpm). Scene clips are also included
individually if you want to re-cut.

## VO script (as recorded)

| Time | Scene | Line |
|---|---|---|
| 0:01 | Landing | "Every day, homeowners with money to spend are emailing contractors — and booking whoever answers first. Most of those emails sit unanswered for hours. That's not a lead problem. That's a leak." |
| 0:20 | Login | "Dyligent SDR plugs it. Sign up, connect your inbox — it starts working the same day." |
| 0:29 | Dashboard | "New email lands? It's a lead instantly — parsed, deduplicated, and in your pipeline." |
| 0:38 | Leads | "Five minutes later — while you're on a roof, under a house, elbow deep in a job — it's already texting and emailing that lead back. In your voice." |
| 0:53 | Review queue | "You approve every message with one tap — or flip on auto-send and let it run." |
| 1:03 | Settings | "It already sounds like your shop, because it learned your services, your area, and your voice straight from your website. And it's free until it books you two real jobs." |
| 1:24 | Closing card | "Your pipeline. Leak-proof." |

## Edit structure

Hard cuts between scenes, fade-to-black on the closing card. The card is
brand navy with the gold logo lockup — "Your pipeline. Leak-proof." /
"Free until it books 2 jobs."

## If you want to re-voice it yourself

Say each line over its scene clip — timings above are where each scene
starts, and each line has ~8s of headroom before the next cut. Record in
one take and slice, or drop me your audio and I'll lay it in.

## Regenerating

- Clips: `node scripts/record-demo.mjs` (dev server must be on :3001)
- VO: `say -v "Zoe (Premium)" -r 178 -o out.aiff "<line>"`
- Assemble: ffmpeg concat + adelay/amix (timings in git history)
