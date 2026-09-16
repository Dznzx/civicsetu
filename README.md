<h1 align="center">CivicSetu</h1>
<p align="center"><b>Report. Route. Resolve.</b></p>

<p align="center">
  <a href="https://civicsetu-sih.vercel.app"><b>Live demo →</b></a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/PWA-installable-1F7A4D?style=flat-square" />
  <img src="https://img.shields.io/badge/Bilingual-EN%20%7C%20%E0%AE%A4%E0%AE%AE%E0%AE%BF%E0%AE%B4%E0%AF%8D-d94f18?style=flat-square" />
  <img src="https://img.shields.io/badge/SIH-26043-6366f1?style=flat-square" />
</p>

---

## The idea

Most civic reporting apps stop at the complaint. A pothole gets logged, it joins a queue, and nothing structural changes.

CivicSetu treats a civic complaint as the **start** of a pipeline rather than the end of one. Reports are clustered by location and type, then routed to whoever can actually act — a municipal body for the immediate fix, and a university department, industry partner or NGO when the underlying problem is worth a real project. A recurring drainage failure stops being 40 separate complaints and becomes one engineering brief with evidence attached.

## What's in it

**For citizens** — report an issue with a photo, browse a community map of what's been reported nearby, track your own reports, and see completed projects. Designed low-literacy-first: warm palette, large targets, plain language, Tamil and English throughout.

**For everyone else** — a deliberately different interface. Dense, neutral, built for scanning: clustered problem queues, routing decisions, progress tracking and policy views. Eight distinct roles are modelled — Student, Faculty, Industry Partner, Government Body, NGO, Mentor, Angel Investor / VC and Platform Admin — each with its own view of the same underlying problem set.

**AI assistance** — photo analysis and report triage on submission, plus a knowledge-base-backed assistant for navigating the platform.

## Design

The two sides of the product look and feel different on purpose, and that split is part of the pitch rather than an inconsistency. It's documented in [`DESIGN.md`](DESIGN.md) — shared tokens, the warm civic-green/saffron citizen palette, the neutral slate authority palette, and the rules that apply across both.

## Stack

Vanilla JavaScript, no framework — the whole citizen app is installable as a PWA with an offline service worker, which matters when the people reporting problems have the worst connectivity. Supabase for data and auth. Serverless functions under `api/` for photo analysis, report triage and chat.

```
index.html          Single-page shell for every role
js/                 citizen · authority · faculty · industry · investor · policy
                    ml · geo-cluster · badges · chatbot · accessibility · i18n
api/                analyze-photo · analyze-report · chat (+ kb.json)
DESIGN.md           The design system
sw.js               Service worker (offline support)
```

## Running it

It's static — serve the directory and open it:

```bash
python3 -m http.server 8000
```

The deployed demo uses a prototype sign-in gate; the passcode is shown on the sign-in screen itself.

---

<p align="center"><i>Built for Smart India Hackathon (problem statement SIH26043).</i></p>
