# YA-Music.com — "01274"

A high-end fan-tribute hub for **YA** — UK rapper out of Bradford, West Yorkshire (the kid from 01274). Built as a thank-you for a personal birthday video.

> The kid from 01274. 20M+ streams independent.

## Stack

- **Astro 5** + Astro Islands (static-first, top Lighthouse scores)
- **Three.js** + custom GLSL shaders (audio-reactive WebGL hero)
- **Tailwind v4** (utility CSS via Vite plugin)
- **React 19** (interactive islands only)
- **GSAP / Lenis / Howler** (scroll, motion, audio — phases 2 & 3)
- **TypeScript strict**

## Run locally

```bash
npm install
npm run dev          # http://localhost:4321
npm run build        # static output to ./dist
npm run preview      # serve the build
```

## Deploy

Auto-deploy via Cloudflare Pages on push to `main`. Manual:

```bash
npm run build
wrangler pages deploy dist --project-name=ya-music
```

## Roadmap

- **Phase 1** (live): WebGL "01274" dial hero, About, Press marquee, Footer.
- **Phase 2**: Auto-sync from public feeds (YouTube RSS, Spotify oEmbed, Instagram public scrape) via Cloudflare Worker cron. 3D discography wall. Insta polaroid stack with drag physics.
- **Phase 3**: Custom audio-reactive cursor, page transitions, "MOLEGRIP" easter egg, performance pass for Lighthouse 95+/80+, Awwwards submission.

## Credits

Site by [Stefan Obholz](https://github.com/stefan-obholz). All music, lyrics, art and likeness © YA. Happy to remove or amend anything on request — write to YAbradfordcity@gmail.com.
