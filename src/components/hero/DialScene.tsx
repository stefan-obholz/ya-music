import { useEffect, useRef, useState } from "react";

const DIAL_DIGITS = ["0", "1", "2", "7", "4"];

const VIDEOS = [
  { mp4: "/video/clip-1.mp4", webm: "/video/clip-1.webm", poster: "/video/poster-1.jpg", track: "Mad" },
  { mp4: "/video/clip-2.mp4", webm: "/video/clip-2.webm", poster: "/video/poster-2.jpg", track: "Robbers & Drivers" },
  { mp4: "/video/clip-3.mp4", webm: "/video/clip-3.webm", poster: "/video/poster-3.jpg", track: "Self Made" },
];

const CLIP_DURATION_MS = 5000;

const DTMF: Record<string, [number, number]> = {
  "0": [941, 1336], "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477], "7": [852, 1209],
  "8": [852, 1336], "9": [852, 1477],
};

function playDtmf(ctx: AudioContext, freqA: number, freqB: number, duration = 0.18) {
  const time = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.18, time + 0.01);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  gain.connect(ctx.destination);

  const a = ctx.createOscillator();
  a.type = "sine";
  a.frequency.value = freqA;
  a.connect(gain);
  a.start(time);
  a.stop(time + duration);

  const b = ctx.createOscillator();
  b.type = "sine";
  b.frequency.value = freqB;
  b.connect(gain);
  b.start(time);
  b.stop(time + duration);
}

export default function DialScene() {
  const audioCtxRef = useRef<AudioContext | null>(null);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [activeDigit, setActiveDigit] = useState(-1);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Crossfade timer
  useEffect(() => {
    if (reducedMotion) return;
    const id = window.setInterval(
      () => setActiveIndex((i) => (i + 1) % VIDEOS.length),
      CLIP_DURATION_MS
    );
    return () => window.clearInterval(id);
  }, [reducedMotion]);

  // Play active video; pause all others to free decoder + GPU
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

  const playDigit = (digit: string, index: number) => {
    if (typeof window === "undefined") return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const freqs = DTMF[digit];
    if (freqs) playDtmf(ctx, freqs[0], freqs[1]);
    setActiveDigit(index);
    setTimeout(() => setActiveDigit(-1), 240);
  };

  const dialAll = () => {
    if (!hasInteracted) setHasInteracted(true);
    DIAL_DIGITS.forEach((d, i) => setTimeout(() => playDigit(d, i), i * 280));
  };

  const showVideoLayer = !reducedMotion;

  return (
    <div className="relative h-screen w-full overflow-hidden bg-asphalt">
      {/* Video carousel layer */}
      {showVideoLayer &&
        VIDEOS.map((v, i) => (
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
            <source src={v.webm} type="video/webm" />
          </video>
        ))}

      {/* Mobile / reduced-motion: static poster */}
      {!showVideoLayer && (
        <img
          src={VIDEOS[0].poster}
          alt="YA performing"
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Darkening overlays for type readability */}
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
        Inbound · Bradford UK
      </div>
      {/* Top-right LIVE + now-playing track */}
      <div className="pointer-events-none absolute right-6 top-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/70 sm:right-10 sm:top-10">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-redbull" />
        {showVideoLayer ? `Now: ${VIDEOS[activeIndex].track}` : "Live"}
      </div>

      {/* YA wordmark + 01274 dial */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <h1
          className="font-display select-none text-[14vw] leading-none text-concrete sm:text-[10vw]"
          style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.9))", letterSpacing: "-0.04em" }}
        >
          YA
        </h1>
        <div className="mt-3 flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.4em] text-concrete/60 sm:mt-4">
          <span className="h-px w-6 bg-concrete/30" />
          the kid from
          <span className="h-px w-6 bg-concrete/30" />
        </div>
        <div
          className="mt-2 flex items-baseline gap-1 sm:mt-3 sm:gap-3"
          style={{ filter: "drop-shadow(0 4px 24px rgba(0,0,0,0.85))" }}
        >
          {DIAL_DIGITS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => playDigit(d, i)}
              className={`font-display select-none text-[14vw] leading-none transition-all duration-200 sm:text-[11vw] ${
                activeDigit === i
                  ? "scale-110 text-traffic"
                  : "text-concrete hover:text-traffic"
              }`}
              aria-label={`Dial ${d}`}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={dialAll}
          className="mt-8 inline-flex items-center gap-3 border border-concrete/40 bg-asphalt/50 px-6 py-3 font-mono text-xs uppercase tracking-[0.3em] text-concrete backdrop-blur-md transition-all hover:border-traffic hover:text-traffic"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-traffic" />
          {hasInteracted ? "Dial again" : "Pick up · Dial 01274"}
        </button>
        <div className="mt-6 max-w-md px-6 text-center font-mono text-[11px] leading-relaxed text-concrete/60">
          The kid from 01274 — Bradford. 20M+ streams independent.
        </div>
      </div>

      {/* Bottom strip */}
      <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/60 sm:bottom-10 sm:left-10 sm:right-10">
        <span>YA · Bradford</span>
        <span>scroll ↓</span>
      </div>
    </div>
  );
}
