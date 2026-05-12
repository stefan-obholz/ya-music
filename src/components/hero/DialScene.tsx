import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const DIAL_DIGITS = ["0", "1", "2", "7", "4"];

const VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uPulse;
  varying vec2 vUv;
  varying float vPulse;

  void main() {
    vUv = uv;
    vec3 pos = position;

    float wave = sin(uv.y * 18.0 - uTime * 1.4) * 0.015;
    pos.z += wave * (0.4 + uPulse * 1.2);

    vPulse = uPulse;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform float uPulse;
  uniform vec2 uMouse;
  varying vec2 vUv;
  varying float vPulse;

  vec3 palette(float t) {
    vec3 a = vec3(0.04, 0.04, 0.04);
    vec3 b = vec3(1.00, 0.27, 0.00); // traffic orange
    vec3 c = vec3(0.00, 0.28, 0.67); // road blue
    vec3 d = vec3(0.88, 0.02, 0.00); // red bull red
    return a + b * 0.5 + sin(6.28 * (c * t + d * 0.5));
  }

  // Fast simplex-ish noise
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
  }

  void main() {
    vec2 uv = vUv;
    vec2 c = uv - 0.5;
    float r = length(c);
    float a = atan(c.y, c.x);

    // Concentric rings of light pulsing outward
    float rings = sin(r * 60.0 - uTime * 2.5) * 0.5 + 0.5;
    rings *= smoothstep(0.5, 0.0, r);

    // Radial sweep
    float sweep = smoothstep(0.0, 0.4, abs(sin(a * 5.0 + uTime * 0.3)));

    // Noise grain
    float n = noise(uv * 220.0 + uTime * 0.5) * 0.18;

    // Mouse glow
    vec2 m = uMouse - 0.5;
    float mouseGlow = exp(-distance(c, m) * 6.0) * 0.5;

    vec3 col = vec3(0.04);
    col += vec3(1.0, 0.27, 0.0) * rings * (0.5 + uPulse * 1.5);
    col += vec3(0.0, 0.28, 0.67) * sweep * 0.15;
    col += vec3(0.88, 0.02, 0.0) * mouseGlow * (0.6 + uPulse);
    col += n;

    // Vignette
    col *= smoothstep(0.95, 0.3, r);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function tone(ctx: AudioContext, freqA: number, freqB: number, duration = 0.18) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(ctx.destination);
  const now = ctx.currentTime;
  gain.gain.linearRampToValueAtTime(0.18, now + 0.01);
  gain.gain.linearRampToValueAtTime(0, now + duration);

  const oscA = ctx.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = freqA;
  oscA.connect(gain);
  oscA.start(now);
  oscA.stop(now + duration);

  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  oscB.frequency.value = freqB;
  oscB.connect(gain);
  oscB.start(now);
  oscB.stop(now + duration);
}

const DTMF: Record<string, [number, number]> = {
  "0": [941, 1336],
  "1": [697, 1209],
  "2": [697, 1336],
  "3": [697, 1477],
  "4": [770, 1209],
  "5": [770, 1336],
  "6": [770, 1477],
  "7": [852, 1209],
  "8": [852, 1336],
  "9": [852, 1477],
};

export default function DialScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const pulseRef = useRef(0);
  const [activeDigit, setActiveDigit] = useState<number>(-1);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const uniforms = {
      uTime: { value: 0 },
      uPulse: { value: 0 },
      uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    };

    const geometry = new THREE.PlaneGeometry(2, 2, 64, 64);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const handleResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener("resize", handleResize);

    const handlePointer = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = 1 - (e.clientY - rect.top) / rect.height;
      uniforms.uMouse.value.set(x, y);
    };
    container.addEventListener("pointermove", handlePointer);

    let raf = 0;
    const start = performance.now();
    const tick = () => {
      const elapsed = (performance.now() - start) / 1000;
      uniforms.uTime.value = elapsed;
      pulseRef.current *= 0.92;
      uniforms.uPulse.value = pulseRef.current;
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointermove", handlePointer);
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  const playDigit = (digit: string, index: number) => {
    if (typeof window === "undefined") return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === "suspended") void ctx.resume();
    const freqs = DTMF[digit];
    if (freqs) tone(ctx, freqs[0], freqs[1]);
    pulseRef.current = 1;
    setActiveDigit(index);
    setTimeout(() => setActiveDigit(-1), 240);
  };

  const dialAll = () => {
    if (!hasInteracted) setHasInteracted(true);
    DIAL_DIGITS.forEach((d, i) => {
      setTimeout(() => playDigit(d, i), i * 280);
    });
  };

  return (
    <div className="relative h-screen w-full overflow-hidden bg-asphalt">
      <div ref={containerRef} className="absolute inset-0" aria-hidden="true" />

      {/* Crosshair frame */}
      <div className="pointer-events-none absolute inset-6 border border-concrete/10 sm:inset-10" />
      <div className="pointer-events-none absolute left-6 top-6 font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/40 sm:left-10 sm:top-10">
        Inbound · Bradford UK
      </div>
      <div className="pointer-events-none absolute right-6 top-6 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/40 sm:right-10 sm:top-10">
        <span className="live-dot inline-block h-2 w-2 rounded-full bg-redbull" />
        Live
      </div>

      {/* The 01274 dial */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-concrete/50">
          // dial
        </div>
        <div className="mt-4 flex items-baseline gap-1 sm:gap-3">
          {DIAL_DIGITS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => playDigit(d, i)}
              className={`font-display select-none text-[18vw] leading-none transition-all duration-200 sm:text-[14vw] ${
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
          className="mt-8 inline-flex items-center gap-3 border border-concrete/30 bg-asphalt/40 px-6 py-3 font-mono text-xs uppercase tracking-[0.3em] text-concrete backdrop-blur-sm transition-all hover:border-traffic hover:text-traffic"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-traffic" />
          {hasInteracted ? "Dial again" : "Pick up · Dial 01274"}
        </button>
        <div className="mt-6 max-w-md px-6 text-center font-mono text-[11px] leading-relaxed text-concrete/40">
          The kid from 01274 — Bradford. 20M+ streams independent. Drop the receiver, click a digit.
        </div>
      </div>

      {/* Bottom marquee strip */}
      <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/40 sm:bottom-10 sm:left-10 sm:right-10">
        <span>YA / YA GODDY</span>
        <span>scroll ↓</span>
      </div>
    </div>
  );
}
