import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const DIAL_DIGITS = ["0", "1", "2", "7", "4"];

const DTMF: Record<string, [number, number]> = {
  "0": [941, 1336], "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477], "7": [852, 1209],
  "8": [852, 1336], "9": [852, 1477],
};

// 138 BPM bassline pattern (16 sixteenth-note steps = 1 bar)
const BPM = 138;
const STEP_SEC = 60 / BPM / 4;

type BassEvent = { type: "kick" | "sub" | "snare"; step: number; freq?: number };

const PATTERN: BassEvent[] = [
  { type: "kick", step: 0 },
  { type: "sub", step: 2, freq: 55 },
  { type: "sub", step: 3, freq: 55 },
  { type: "kick", step: 4 },
  { type: "snare", step: 4 },
  { type: "sub", step: 6, freq: 73 },
  { type: "sub", step: 7, freq: 73 },
  { type: "kick", step: 8 },
  { type: "sub", step: 10, freq: 55 },
  { type: "sub", step: 11, freq: 65 },
  { type: "kick", step: 12 },
  { type: "snare", step: 12 },
  { type: "sub", step: 14, freq: 82 },
  { type: "sub", step: 15, freq: 82 },
];

function playKick(ctx: AudioContext, dest: AudioNode, time: number) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(160, time);
  osc.frequency.exponentialRampToValueAtTime(38, time + 0.13);
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.85, time + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.42);
  osc.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.5);
}

function playSub(ctx: AudioContext, dest: AudioNode, time: number, freq: number) {
  const osc = ctx.createOscillator();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(freq, time);

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(160, time);
  filter.Q.value = 6;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.45, time + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.18);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(time);
  osc.stop(time + 0.2);
}

function playSnare(ctx: AudioContext, dest: AudioNode, time: number) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.12), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  }
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 1200;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.28, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  noise.start(time);
  noise.stop(time + 0.13);
}

function playDtmf(ctx: AudioContext, dest: AudioNode, freqA: number, freqB: number, duration = 0.18) {
  const time = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, time);
  gain.gain.linearRampToValueAtTime(0.18, time + 0.01);
  gain.gain.linearRampToValueAtTime(0, time + duration);
  gain.connect(dest);

  const oscA = ctx.createOscillator();
  oscA.type = "sine";
  oscA.frequency.value = freqA;
  oscA.connect(gain);
  oscA.start(time);
  oscA.stop(time + duration);

  const oscB = ctx.createOscillator();
  oscB.type = "sine";
  oscB.frequency.value = freqB;
  oscB.connect(gain);
  oscB.start(time);
  oscB.stop(time + duration);
}

export default function SubwooferScene() {
  const containerRef = useRef<HTMLDivElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dialPulseRef = useRef(0);

  const [activeDigit, setActiveDigit] = useState(-1);
  const [bassPlaying, setBassPlaying] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);

  const ensureAudio = () => {
    if (typeof window === "undefined") return null;
    if (!audioCtxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = 0.85;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.4;
      master.connect(analyser);
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      masterGainRef.current = master;
      analyserRef.current = analyser;
    }
    if (audioCtxRef.current.state === "suspended") void audioCtxRef.current.resume();
    return {
      ctx: audioCtxRef.current,
      master: masterGainRef.current!,
      analyser: analyserRef.current!,
    };
  };

  // Three.js scene
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0a0a, 6, 14);

    const camera = new THREE.PerspectiveCamera(38, container.clientWidth / container.clientHeight, 0.1, 100);
    const setCameraDistance = () => {
      const aspect = container.clientWidth / container.clientHeight;
      camera.position.set(0, 0, aspect < 1 ? 11 : aspect < 1.4 ? 9 : 8);
      camera.lookAt(0, 0, 0);
      camera.aspect = aspect;
      camera.updateProjectionMatrix();
    };
    setCameraDistance();

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));
    const keyLight = new THREE.PointLight(0xff4500, 1.6, 30);
    keyLight.position.set(-5, 3, 5);
    scene.add(keyLight);
    const fillLight = new THREE.PointLight(0x0047ab, 0.7, 30);
    fillLight.position.set(5, -2, 5);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0xffffff, 0.3);
    rimLight.position.set(0, 0, -5);
    scene.add(rimLight);

    // === Subwoofer assembly ===
    const subwoofer = new THREE.Group();

    // Outer steel basket frame
    const basketGeo = new THREE.TorusGeometry(2.65, 0.06, 12, 96);
    const basketMat = new THREE.MeshStandardMaterial({
      color: 0x2a2a2a,
      metalness: 0.95,
      roughness: 0.25,
    });
    const basket = new THREE.Mesh(basketGeo, basketMat);
    basket.position.z = -0.18;
    subwoofer.add(basket);

    // Surround (rubber edge)
    const surroundGeo = new THREE.TorusGeometry(2.4, 0.2, 16, 96);
    const surroundMat = new THREE.MeshStandardMaterial({
      color: 0x0d0d0d,
      metalness: 0.1,
      roughness: 0.85,
    });
    const surround = new THREE.Mesh(surroundGeo, surroundMat);
    subwoofer.add(surround);

    // Cone (paper diaphragm)
    const coneGeo = new THREE.CircleGeometry(2.3, 96);
    const coneMat = new THREE.MeshStandardMaterial({
      color: 0x161616,
      metalness: 0.05,
      roughness: 0.95,
    });
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.z = -0.08;
    subwoofer.add(cone);

    // Concentric ridge lines on the cone
    for (let i = 1; i <= 4; i++) {
      const r = 0.4 + i * 0.42;
      const ridgeGeo = new THREE.RingGeometry(r, r + 0.012, 96);
      const ridgeMat = new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.55,
      });
      const ridge = new THREE.Mesh(ridgeGeo, ridgeMat);
      ridge.position.z = -0.075;
      subwoofer.add(ridge);
    }

    // Dust cap (center hemisphere)
    const capGeo = new THREE.SphereGeometry(0.5, 48, 48, 0, Math.PI * 2, 0, Math.PI / 2);
    const capMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0a,
      metalness: 0.4,
      roughness: 0.4,
    });
    const cap = new THREE.Mesh(capGeo, capMat);
    cap.position.z = 0.05;
    subwoofer.add(cap);

    // Brand pip on dust cap
    const pipGeo = new THREE.CircleGeometry(0.08, 24);
    const pipMat = new THREE.MeshBasicMaterial({ color: 0xff4500 });
    const pip = new THREE.Mesh(pipGeo, pipMat);
    pip.position.z = 0.5;
    subwoofer.add(pip);

    scene.add(subwoofer);

    // Mounting screws (4 around the basket)
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      const screwGeo = new THREE.CircleGeometry(0.06, 12);
      const screwMat = new THREE.MeshBasicMaterial({ color: 0x444444 });
      const screw = new THREE.Mesh(screwGeo, screwMat);
      screw.position.set(Math.cos(angle) * 2.78, Math.sin(angle) * 2.78, -0.15);
      scene.add(screw);
    }

    // === Ring pulses (emitted on bass kick) ===
    const ringGeo = new THREE.RingGeometry(2.4, 2.48, 96);
    const ringPulses: Array<{ mesh: THREE.Mesh; born: number }> = [];

    function spawnRingPulse(now: number) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xff4500,
        transparent: true,
        opacity: 0.55,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(ringGeo, mat);
      mesh.position.z = 0.05;
      scene.add(mesh);
      ringPulses.push({ mesh, born: now });
    }

    // === Particle dust ===
    const particleCount = 280;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const seeds = new Float32Array(particleCount);
    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 2.9 + Math.random() * 2.5;
      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = Math.sin(angle) * radius;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
      seeds[i] = Math.random() * Math.PI * 2;
    }
    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xf5f5f0,
      size: 0.02,
      transparent: true,
      opacity: 0.45,
      sizeAttenuation: true,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    scene.add(particles);

    const handleResize = () => {
      renderer.setSize(container.clientWidth, container.clientHeight);
      setCameraDistance();
    };
    window.addEventListener("resize", handleResize);

    // Mouse parallax
    let targetTiltX = 0;
    let targetTiltY = 0;
    const handlePointer = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      targetTiltX = -y * 0.18;
      targetTiltY = x * 0.18;
    };
    container.addEventListener("pointermove", handlePointer);

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    const start = performance.now();
    const freqData = new Uint8Array(256);
    let lastKickTime = 0;
    let smoothBass = 0;

    const tick = () => {
      const now = performance.now();
      const elapsed = (now - start) / 1000;

      let bassEnergy = 0;
      const analyser = analyserRef.current;
      if (analyser) {
        analyser.getByteFrequencyData(freqData);
        // FFT 512 @ 44.1kHz → bin width ≈ 86 Hz. Bins 0-4 ≈ 0-430Hz (bass+low-mid).
        bassEnergy =
          (freqData[0] + freqData[1] + freqData[2] + freqData[3] + freqData[4]) / 5 / 255;
      }

      // Idle breath when nothing playing
      const idleBreath = (Math.sin(elapsed * 1.1) * 0.5 + 0.5) * 0.025;
      const dialPulse = dialPulseRef.current;
      dialPulseRef.current *= 0.92;
      const totalBass = Math.max(bassEnergy, idleBreath, dialPulse * 0.5);
      smoothBass += (totalBass - smoothBass) * 0.28;

      // Subwoofer cone displacement
      subwoofer.position.z = smoothBass * 0.45;
      cap.position.z = 0.05 + smoothBass * 0.55;
      pip.position.z = 0.5 + smoothBass * 0.55;
      cone.position.z = -0.08 + smoothBass * 0.32;
      subwoofer.scale.setScalar(1 + smoothBass * 0.045);

      // Cone color shift on heavy bass (subtle warm push)
      const coneBase = new THREE.Color(0x161616);
      const conePeak = new THREE.Color(0x4a1a05);
      coneMat.color.copy(coneBase).lerp(conePeak, Math.min(smoothBass * 1.4, 1));

      // Mouse parallax tilt
      subwoofer.rotation.x += (targetTiltX - subwoofer.rotation.x) * 0.04;
      subwoofer.rotation.y += (targetTiltY - subwoofer.rotation.y) * 0.04;

      // Kick threshold → spawn ring pulse
      const kickThreshold = 0.5;
      if (bassEnergy > kickThreshold && now - lastKickTime > 180) {
        spawnRingPulse(now);
        lastKickTime = now;
      }

      // Update ring pulses (expand + fade)
      for (let i = ringPulses.length - 1; i >= 0; i--) {
        const p = ringPulses[i];
        const age = (now - p.born) / 1000;
        if (age > 1.5) {
          scene.remove(p.mesh);
          (p.mesh.material as THREE.Material).dispose();
          ringPulses.splice(i, 1);
        } else {
          const t = age / 1.5;
          const eased = 1 - Math.pow(1 - t, 3);
          p.mesh.scale.setScalar(1 + eased * 1.6);
          (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - t);
        }
      }

      // Particle drift
      if (!reducedMotion) {
        const ppos = particles.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < particleCount; i++) {
          const ix = i * 3;
          const dx = ppos[ix];
          const dy = ppos[ix + 1];
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > 0.001) {
            const force = smoothBass * 0.012 + 0.0005;
            ppos[ix] += (dx / dist) * force;
            ppos[ix + 1] += (dy / dist) * force;
          }
          ppos[ix + 2] += Math.sin(elapsed * 1.2 + seeds[i]) * 0.0015;

          if (dist > 5.5) {
            const angle = Math.random() * Math.PI * 2;
            const r = 2.9 + Math.random() * 0.6;
            ppos[ix] = Math.cos(angle) * r;
            ppos[ix + 1] = Math.sin(angle) * r;
            ppos[ix + 2] = (Math.random() - 0.5) * 1.2;
          }
        }
        particles.geometry.attributes.position.needsUpdate = true;
      }

      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("pointermove", handlePointer);
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
          obj.geometry?.dispose();
          if (obj.material instanceof THREE.Material) obj.material.dispose();
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Bassline scheduler — runs while bassPlaying is true
  useEffect(() => {
    if (!bassPlaying) return;
    const audio = ensureAudio();
    if (!audio) return;
    const { ctx, master } = audio;

    let stepIdx = 0;
    const totalSteps = 16;
    let nextStepTime = ctx.currentTime + 0.08;

    const scheduleAhead = () => {
      const lookahead = 0.12;
      while (nextStepTime < ctx.currentTime + lookahead) {
        const stepInPattern = stepIdx % totalSteps;
        const events = PATTERN.filter((e) => e.step === stepInPattern);
        for (const ev of events) {
          if (ev.type === "kick") playKick(ctx, master, nextStepTime);
          else if (ev.type === "sub" && ev.freq != null) playSub(ctx, master, nextStepTime, ev.freq);
          else if (ev.type === "snare") playSnare(ctx, master, nextStepTime);
        }
        nextStepTime += STEP_SEC;
        stepIdx++;
      }
    };

    scheduleAhead();
    const interval = window.setInterval(scheduleAhead, 25);
    return () => window.clearInterval(interval);
  }, [bassPlaying]);

  const playDigit = (digit: string, index: number) => {
    if (!hasInteracted) setHasInteracted(true);
    const audio = ensureAudio();
    if (!audio) return;
    const freqs = DTMF[digit];
    if (freqs) playDtmf(audio.ctx, audio.master, freqs[0], freqs[1]);
    dialPulseRef.current = 1;
    setActiveDigit(index);
    setTimeout(() => setActiveDigit(-1), 240);
  };

  const dialAll = () => {
    DIAL_DIGITS.forEach((d, i) => setTimeout(() => playDigit(d, i), i * 280));
  };

  const toggleBass = () => {
    if (!hasInteracted) setHasInteracted(true);
    ensureAudio();
    setBassPlaying((p) => !p);
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
        {bassPlaying ? "Bass · live" : "Live"}
      </div>

      {/* Dial + controls overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.4em] text-concrete/50">
          // dial · 138 BPM
        </div>
        <div
          className="mt-4 flex items-baseline gap-1 sm:gap-3"
          style={{ filter: "drop-shadow(0 4px 32px rgba(0,0,0,0.85))" }}
        >
          {DIAL_DIGITS.map((d, i) => (
            <button
              key={i}
              type="button"
              onClick={() => playDigit(d, i)}
              className={`font-display select-none text-[18vw] leading-none transition-all duration-200 sm:text-[14vw] ${
                activeDigit === i ? "scale-110 text-traffic" : "text-concrete hover:text-traffic"
              }`}
              aria-label={`Dial ${d}`}
            >
              {d}
            </button>
          ))}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <button
            type="button"
            onClick={dialAll}
            className="inline-flex items-center gap-3 border border-concrete/30 bg-asphalt/40 px-6 py-3 font-mono text-xs uppercase tracking-[0.3em] text-concrete backdrop-blur-sm transition-all hover:border-traffic hover:text-traffic"
          >
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-traffic" />
            {hasInteracted ? "Dial again" : "Pick up · Dial 01274"}
          </button>
          <button
            type="button"
            onClick={toggleBass}
            className={`inline-flex items-center gap-3 border px-6 py-3 font-mono text-xs uppercase tracking-[0.3em] backdrop-blur-sm transition-all ${
              bassPlaying
                ? "border-redbull bg-redbull/20 text-redbull hover:bg-redbull hover:text-asphalt"
                : "border-concrete/30 bg-asphalt/40 text-concrete hover:border-redbull hover:text-redbull"
            }`}
          >
            <span
              className={`inline-block h-1.5 w-1.5 rounded-full ${
                bassPlaying ? "live-dot bg-redbull" : "bg-redbull"
              }`}
            />
            {bassPlaying ? "Cut the bass" : "Drop the bass"}
          </button>
        </div>

        <div className="mt-6 max-w-md px-6 text-center font-mono text-[11px] leading-relaxed text-concrete/40">
          The kid from 01274 — Bradford. 20M+ streams independent.
          Hit the dial or drop the bass.
        </div>
      </div>

      <div className="pointer-events-none absolute bottom-6 left-6 right-6 flex justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-concrete/40 sm:bottom-10 sm:left-10 sm:right-10">
        <span>YA · Bradford</span>
        <span>scroll ↓</span>
      </div>
    </div>
  );
}
