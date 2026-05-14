import { useEffect, useRef, useState } from "react";

interface VideoClip {
  mp4: string;
  webm?: string;
  poster: string;
  track: string;
}

interface Props {
  name: string;
  city: string;
  tagline: string;
  videos: VideoClip[];
  spotifyUrl?: string;
  topTrackTitle?: string;
  cityShort?: string;
}

const CLIP_DURATION_MS = 5000;

export default function ArtistHero({
  name,
  city,
  tagline,
  videos,
  spotifyUrl,
  topTrackTitle,
  cityShort,
}: Props) {
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reducedMotion || videos.length <= 1) return;
    const id = window.setInterval(
      () => setActiveIndex((i) => (i + 1) % videos.length),
      CLIP_DURATION_MS
    );
    return () => window.clearInterval(id);
  }, [reducedMotion, videos.length]);

  useEffect(() => {
    if (reducedMotion) return;
    videoRefs.current.forEach((v, i) => {
      if (!v) return;
      if (i === activeIndex) {
        try {
          v.currentTime = 0;
          const p = v.play();
          if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {
          /* ignore */
        }
      } else {
        try {
          v.pause();
        } catch {
          /* ignore */
        }
      }
    });
  }, [activeIndex, reducedMotion]);

  const showVideo = !reducedMotion && videos.length > 0;
  const currentTrack = videos[activeIndex]?.track ?? topTrackTitle;
  const cityLabel = cityShort ?? city.split(",")[0];

  return (
    <div className="relative h-screen w-full overflow-hidden bg-asphalt">
      {/* Video carousel layer */}
      {showVideo &&
        videos.map((v, i) => (
          <video
            key={i}
            ref={(el) => {
              videoRefs.current[i] = el;
            }}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ease-out ${
              i === activeIndex ? "opacity-100" : "opacity-0"
            }`}
            style={{ willChange: "opacity" }}
            autoPlay={i === 0}
            muted
            loop
            playsInline
            poster={v.poster}
            preload={i === 0 ? "auto" : "metadata"}
            aria-hidden="true"
          >
            <source src={v.mp4} type="video/mp4" />
            {v.webm && <source src={v.webm} type="video/webm" />}
          </video>
        ))}

      {/* Reduced-motion fallback: static poster */}
      {!showVideo && videos[0] && (
        <img
          src={videos[0].poster}
          alt={`${name} performing`}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Darkening overlays */}
      <div className="absolute inset-0 bg-asphalt/55" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 0%, rgba(10,10,10,0.55) 70%, rgba(10,10,10,0.85) 100%)",
        }}
      />

      {/* Crosshair frame */}
      <div className="pointer-events-none absolute inset-6 border border-concrete/15 sm:inset-10" />

      {/* Top-left meta */}
      <div className="pointer-events-none absolute left-6 top-6 font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/70 sm:left-10 sm:top-10">
        Inbound · {cityLabel} UK
      </div>
      {/* Top-right LIVE + now-playing */}
      <div className="pointer-events-none absolute right-6 top-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/70 sm:right-10 sm:top-10">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-redbull" />
        {currentTrack ? `Now: ${currentTrack}` : "Live"}
      </div>

      {/* Centered name + tagline + CTA */}
      <div className="absolute inset-0 flex flex-col items-center justify-center px-6">
        <h1
          className="font-display select-none text-center text-[22vw] leading-none text-concrete sm:text-[16vw] lg:text-[14vw]"
          style={{ filter: "drop-shadow(0 4px 32px rgba(0,0,0,0.95))", letterSpacing: "-0.04em" }}
        >
          {name}
        </h1>

        <div className="mt-4 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-concrete/80 sm:mt-6 sm:text-xs">
          <span className="h-px w-6 bg-concrete/40" />
          {tagline}
          <span className="h-px w-6 bg-concrete/40" />
        </div>

        {spotifyUrl && (
          <a
            href={spotifyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center gap-3 border border-concrete/40 bg-asphalt/50 px-6 py-3 font-mono text-xs uppercase tracking-[0.3em] text-concrete backdrop-blur-md transition-all hover:border-traffic hover:text-traffic sm:mt-10"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-traffic" />
            Hit play · Spotify
          </a>
        )}
      </div>

      {/* Bottom strip */}
      <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/60 sm:bottom-10 sm:left-10 sm:right-10">
        <span>{name} · {cityLabel}</span>
        <span>scroll ↓</span>
      </div>
    </div>
  );
}
