"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import s from "./VoiceChat.module.css";

export type VoiceChatSpeaker = "agent" | "user";
export type VoiceChatPanel = "transcript" | "settings";
export type VoiceChatSpeed = 1 | 1.25 | 1.5 | 2;
export type VoiceChatEffort = "low" | "medium" | "high" | "xhigh";

export interface VoiceChatVoice {
  id: string;
  name: string;
  hint: string;
  /** Sample line for the in-menu preview. */
  sample?: string;
  pitch?: number;
  rate?: number;
}

export interface VoiceChatInput {
  id: string;
  name: string;
}

export interface VoiceChatTurn {
  who: VoiceChatSpeaker;
  text: string;
}

interface Line {
  id: number;
  who: VoiceChatSpeaker;
  words: string[];
  shown: number;
  /** Offset from the start of the call, in ms. */
  at: number;
}

export const VOICE_CHAT_VOICES: VoiceChatVoice[] = [
  { id: "liora", name: "Liora", hint: "Warm, unhurried", pitch: 1.1, rate: 0.95 },
  { id: "juno", name: "Juno", hint: "Bright, upbeat", pitch: 1.35, rate: 1.08 },
  { id: "arlo", name: "Arlo", hint: "Low, steady", pitch: 0.75, rate: 0.92 },
  { id: "mika", name: "Mika", hint: "Crisp, quick", pitch: 1, rate: 1.15 },
];

export const VOICE_CHAT_LANGUAGES = [
  "Auto-detect",
  "English",
  "German",
  "Spanish",
  "French",
  "Japanese",
];

export const VOICE_CHAT_INPUTS: VoiceChatInput[] = [
  { id: "default", name: "MacBook Pro Microphone" },
  { id: "airpods", name: "AirPods Pro" },
  { id: "studio", name: "Studio Display Microphone" },
];

const SPEEDS: VoiceChatSpeed[] = [1, 1.25, 1.5, 2];
const EFFORTS: VoiceChatEffort[] = ["low", "medium", "high", "xhigh"];
const EFFORT_LABELS: Record<VoiceChatEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Extra High",
};

const DEMO_SCRIPT: VoiceChatTurn[] = [
  {
    who: "agent",
    text: "Hey, I'm here for the everyday stuff — food, reservations, appointments. Just say what you need.",
  },
  {
    who: "user",
    text: "Can you book a table for two tonight, somewhere quiet near the office?",
  },
  {
    who: "agent",
    text: "Sure. Nori on 5th Street has a quiet corner table at 7:30. Should I hold it?",
  },
  { who: "user", text: "Yes, and put it in my calendar." },
  {
    who: "agent",
    text: "Done. Table for two at Nori, 7:30 tonight, and it's on your calendar.",
  },
];

const BARS = 28;

/* ---------------------------------------------------------------- *
 * Agent glyph geometry (viewBox -16 -16 32 32)
 * ---------------------------------------------------------------- */

const EYES = [-3.2, 3.2];
const EYE_Y = -2.6;
const EYE_W = 2.4;
const EYE_H = 5.4;
const MOUTH_Y = 4.4;

/** A soft five-lobed pebble. Two slower harmonics keep it from looking stamped. */
function blobPath(t: number, level: number) {
  const n = 96;
  const r0 = 13.4;
  const a5 = 0.06 + level * 0.035;
  const a3 = 0.025 + level * 0.02;
  let d = "";
  for (let i = 0; i < n; i++) {
    const th = (i / n) * Math.PI * 2;
    const r =
      r0 *
      (1 +
        a5 * Math.cos(5 * th) +
        a3 * Math.cos(3 * th + t * 0.9) +
        0.012 * Math.cos(7 * th - t * 1.3));
    d += `${i ? "L" : "M"}${(r * Math.cos(th)).toFixed(2)} ${(r * Math.sin(th)).toFixed(2)}`;
  }
  return `${d}Z`;
}

/**
 * Closed it is a stroke whose curve follows `smile` (0 flat, 1 wide grin);
 * open, the lips part into a filled mouth.
 */
function mouthPath(cx: number, cy: number, open: number, smile: number) {
  const w = 2 + smile * 0.8 - open * 0.3;
  const ends = cy - smile * 0.4;
  const curve = cy + 0.4 + smile * 1.6;
  const low = curve + open * 1.8;
  const up = curve - open * 2.4;
  const f = (n: number) => n.toFixed(2);
  return `M${f(cx - w)} ${f(ends)}Q${f(cx)} ${f(low)} ${f(cx + w)} ${f(ends)}Q${f(cx)} ${f(up)} ${f(cx - w)} ${f(ends)}Z`;
}

/**
 * One closed shape made of two cubics, so it can morph: an upright oval (squashed
 * by `open` to blink) blends into a laughing crescent as `laugh` goes to 1.
 */
function eyePath(x: number, y: number, open: number, laugh: number) {
  const a = EYE_W / 2;
  const b = Math.max(0.35, (EYE_H / 2) * open) * (4 / 3);
  const oval = [x - a, y, x - a, y - b, x + a, y - b, x + a, y, x + a, y + b, x - a, y + b];
  const cx = x;
  const cy = EYE_Y + 0.4;
  const happy = [cx - 1.7, cy + 1, cx - 1.5, cy - 1.6, cx + 1.5, cy - 1.6, cx + 1.7, cy + 1, cx + 1.1, cy - 0.3, cx - 1.1, cy - 0.3];
  const p = oval.map((v, i) => (v + (happy[i] - v) * laugh).toFixed(2));
  return `M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}C${p[8]} ${p[9]} ${p[10]} ${p[11]} ${p[0]} ${p[1]}Z`;
}

const smoothstep = (t: number) => t * t * (3 - 2 * t);

function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/* ---------------------------------------------------------------- *
 * Agent face
 * ---------------------------------------------------------------- */

interface AgentSignal {
  who: VoiceChatSpeaker | null;
  level: number;
  muted: boolean;
}

const IDLE: AgentSignal = { who: null, level: 0, muted: false };

// Shared across instances so the pebble keeps its pose when the bar hands off to the start button.
let spin = 0;

function AgentFace({ signal, className }: { signal?: { current: AgentSignal }; className?: string }) {
  const gradId = `vc-agent-${useId().replace(/:/g, "")}`;
  const bodyRef = useRef<SVGGElement>(null);
  const blobGroupRef = useRef<SVGGElement>(null);
  const blobRef = useRef<SVGPathElement>(null);
  const eyeRefs = useRef<(SVGPathElement | null)[]>([]);
  const mouthRef = useRef<SVGPathElement>(null);
  const tickledAt = useRef(-Infinity);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let pointer: { x: number; y: number } | null = null;
    const onMove = (e: PointerEvent) => {
      pointer = e.pointerType === "mouse" ? { x: e.clientX, y: e.clientY } : null;
    };
    const onLeave = () => {
      pointer = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    let raf = 0;
    let last = performance.now();
    let gx = 0;
    let gy = 0;
    let tx = 0;
    let ty = 0;
    let nextGaze = last + 1400;
    let blinkAt = last + 1600;
    let blinkStart = -1;
    let second = false;
    let smile = 0.4;
    let grinUntil = 0;
    let nextGrin = last + 4000 + Math.random() * 4000;
    let prevWho: VoiceChatSpeaker | null = null;
    let syllable = 0;
    let syllableRate = 5.5;
    let syllableAmp = 1;
    let jaw = 0;

    const frame = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      const { who, level, muted } = signal?.current ?? IDLE;
      if (prevWho === "agent" && who !== "agent") grinUntil = now + 1100;
      prevWho = who;

      // Within 100px of the face the eyes lock onto the cursor; the scripted gaze waits until it leaves.
      let watching = false;
      const box = pointer ? svgRef.current?.getBoundingClientRect() : undefined;
      if (pointer && box && box.width > 0) {
        const dx = pointer.x - (box.left + box.width / 2);
        const dy = pointer.y - (box.top + box.height / 2);
        if (Math.hypot(dx, dy) < 100 + box.width / 2) {
          watching = true;
          tx = Math.max(-1, Math.min(1, dx / 60));
          ty = Math.max(-1, Math.min(1, dy / 60));
          nextGaze = now + 700;
        }
      }
      if (!watching && now > nextGaze) {
        if (who === "user") {
          tx = 0.8 + Math.random() * 0.3;
          ty = -0.15;
        } else if (who === "agent") {
          tx = (Math.random() - 0.5) * 0.7;
          ty = (Math.random() - 0.5) * 0.4;
        } else {
          tx = [-1, -0.6, 0, 0, 0.6, 1][Math.floor(Math.random() * 6)];
          ty = (Math.random() - 0.5) * 1.2;
        }
        nextGaze = now + 900 + Math.random() * 2300;
      }
      const ease = Math.min(1, dt * (watching ? 14 : 10));
      gx += (tx - gx) * ease;
      gy += (ty - gy) * ease;

      if (blinkStart < 0 && now > blinkAt) blinkStart = now;
      let open = 1;
      if (blinkStart >= 0) {
        const p = (now - blinkStart) / 170;
        if (p >= 1) {
          blinkStart = -1;
          if (!second && Math.random() < 0.22) {
            second = true;
            blinkAt = now + 90;
          } else {
            second = false;
            blinkAt = now + 2000 + Math.random() * 3200;
          }
        } else {
          open = 1 - Math.sin(p * Math.PI) * 0.88;
        }
      }

      // A short giggle per hover: eyes curl up, one quick wiggle, then it settles back.
      const since = now - tickledAt.current;
      let laugh = 0;
      let wiggle = 0;
      if (since < 1300) {
        laugh = since < 180 ? smoothstep(since / 180) : since < 800 ? 1 : 1 - smoothstep((since - 800) / 500);
        wiggle = Math.sin(since / 42) * Math.max(0, 1 - since / 520);
      }

      if (now > nextGrin) {
        grinUntil = now + 1200;
        nextGrin = now + 5000 + Math.random() * 6000;
      }
      let mood = who === "user" ? 0.8 : who === "agent" ? 0.55 : muted ? 0.12 : 0.4;
      if (now < grinUntil) mood = 1;
      smile += (mood - smile) * Math.min(1, dt * 5);
      const grin = smile + (1 - smile) * laugh;

      spin = (spin + dt * (6 + level * 22)) % 360;
      const scale = 1 + 0.015 * Math.sin(now / 900) + level * 0.04;
      blobRef.current?.setAttribute("d", blobPath(now / 1000, level + laugh * 0.25));
      blobGroupRef.current?.setAttribute("transform", `rotate(${spin.toFixed(2)}) scale(${scale.toFixed(4)})`);
      bodyRef.current?.setAttribute(
        "transform",
        `rotate(${(wiggle * 4).toFixed(2)}) translate(0 ${(-laugh * 0.5 + jaw * 0.25).toFixed(2)})`,
      );

      const look = 1 - laugh;
      const squint = 1 - 0.18 * Math.max(0, (grin - 0.6) / 0.4);
      eyeRefs.current.forEach((eye, i) => {
        if (!eye) return;
        const x = EYES[i] + gx * 1.8 * look;
        const y = EYE_Y + gy * 1.1 * look;
        eye.setAttribute("d", eyePath(x, y, open * squint, laugh));
        eye.setAttribute("stroke-width", (laugh * 0.7).toFixed(2));
      });

      // Speech: the jaw opens and closes per syllable (~5–6 a second), each a little different,
      // with the odd near-closed beat between words.
      let talkTarget = 0;
      if (who === "agent") {
        syllable += dt * syllableRate * Math.PI * 2;
        if (syllable >= Math.PI * 2) {
          syllable -= Math.PI * 2;
          syllableRate = 4.6 + Math.random() * 2;
          syllableAmp = Math.random() < 0.18 ? 0.12 : 0.55 + Math.random() * 0.45;
        }
        talkTarget = Math.min(1, (0.35 + level) * syllableAmp * (0.5 - 0.5 * Math.cos(syllable)));
      } else {
        syllable = 0;
      }
      jaw += (talkTarget - jaw) * Math.min(1, dt * (talkTarget > jaw ? 30 : 20));
      const talk = jaw;
      const giggle = since < 1300 ? laugh * (0.3 + 0.25 * Math.abs(Math.sin(since / 85))) : 0;
      mouthRef.current?.setAttribute(
        "d",
        mouthPath(gx * 1.2 * look, MOUTH_Y + gy * 0.6 * look, Math.max(talk, giggle), grin),
      );

      if (!reduce) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [signal]);

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox="-16 -16 32 32"
      data-vc-agent=""
      aria-hidden
      onPointerEnter={() => {
        const now = performance.now();
        if (now - tickledAt.current > 1300) tickledAt.current = now;
      }}
    >
      <defs>
        <radialGradient id={gradId} cx="0.32" cy="0.26" r="0.9">
          <stop offset="0" stopColor="var(--vc-agent-1)" />
          <stop offset="1" stopColor="var(--vc-agent-2)" />
        </radialGradient>
      </defs>
      <g ref={bodyRef}>
        <g ref={blobGroupRef}>
          <path ref={blobRef} d={blobPath(0, 0)} fill={`url(#${gradId})`} />
        </g>
        {EYES.map((x, i) => (
          <path
            key={x}
            ref={(node) => {
              eyeRefs.current[i] = node;
            }}
            d={eyePath(x, EYE_Y, 1, 0)}
            fill="var(--vc-agent-face)"
            stroke="var(--vc-agent-face)"
            strokeWidth={0}
            strokeLinejoin="round"
          />
        ))}
        <path
          ref={mouthRef}
          d={mouthPath(0, MOUTH_Y, 0, 0.4)}
          fill="var(--vc-agent-face)"
          stroke="var(--vc-agent-face)"
          strokeWidth={1.4}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

/* ---------------------------------------------------------------- *
 * Icons (24px grid, 1.25px at 16px)
 * ---------------------------------------------------------------- */

const STROKE = 1.875;

function Svg({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function GearIcon() {
  return (
    <Svg>
      <g className={s.gear}>
        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
        <circle cx="12" cy="12" r="3" />
      </g>
    </Svg>
  );
}

function TranscriptIcon() {
  return (
    <Svg>
      <path className={s.bubble} d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
      {[8, 12, 16].map((x, i) => (
        <circle
          key={x}
          className={s.dot}
          cx={x}
          cy="12"
          r="1.15"
          fill="currentColor"
          stroke="none"
          style={{ "--d": i } as CSSProperties}
        />
      ))}
    </Svg>
  );
}

function MicIcon({ maskId }: { maskId: string }) {
  const slash = "M4 3.5 20.5 20";
  return (
    <Svg>
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <rect width="24" height="24" fill="#fff" stroke="none" />
          <path className={s.slashCut} d={slash} pathLength={1} stroke="#000" strokeWidth={4.6} />
        </mask>
      </defs>
      <g mask={`url(#${maskId})`}>
        <g className={s.micBody}>
          <path d="M12 2.75a3 3 0 0 0-3 3V12a3 3 0 0 0 6 0V5.75a3 3 0 0 0-3-3Z" />
          <path d="M18.5 10.5v1.25a6.5 6.5 0 0 1-13 0V10.5" />
          <path d="M12 18.25v3" />
        </g>
      </g>
      <path className={s.slash} d={slash} pathLength={1} />
    </Svg>
  );
}

function HangUpIcon() {
  return (
    <Svg>
      <path
        className={s.handset}
        d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"
      />
    </Svg>
  );
}

function ChevronIcon() {
  return (
    <svg className={s.chev} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className={s.check} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/* ---------------------------------------------------------------- *
 * Select (Voice, Language)
 * ---------------------------------------------------------------- */

function clippingBounds(from: HTMLElement) {
  let top = 0;
  let bottom = window.innerHeight;
  for (let el = from.parentElement; el; el = el.parentElement) {
    if (el.hasAttribute("data-vc-panel")) continue;
    const cs = getComputedStyle(el);
    if (/(hidden|auto|scroll|clip)/.test(`${cs.overflowX} ${cs.overflowY}`)) {
      const r = el.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return { top, bottom };
}

const MENU_MS = 200;

function Select({
  label,
  display,
  onOpenChange,
  children,
}: {
  label: string;
  display: ReactNode;
  onOpenChange: (open: boolean) => void;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [side, setSide] = useState<"down" | "up">("down");
  const hostRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const triggerId = `vc-select-${useId().replace(/:/g, "")}`;

  const set = useCallback(
    (next: boolean) => {
      window.clearTimeout(closeTimer.current);
      if (next) {
        setClosing(false);
        setOpen(true);
        onOpenChange(true);
        return;
      }
      setClosing(true);
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      closeTimer.current = window.setTimeout(
        () => {
          setOpen(false);
          setClosing(false);
          onOpenChange(false);
        },
        reduce ? 0 : MENU_MS,
      );
    },
    [onOpenChange],
  );

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useLayoutEffect(() => {
    if (!open || !triggerRef.current || !menuRef.current || !hostRef.current) return;
    const t = triggerRef.current.getBoundingClientRect();
    const h = menuRef.current.offsetHeight;
    const clip = clippingBounds(hostRef.current);
    const below = clip.bottom - t.bottom - 10;
    const above = t.top - clip.top - 10;
    setSide(h <= below || below >= above ? "down" : "up");
  }, [open]);

  useEffect(() => {
    if (!open || closing) return;
    const onDown = (e: PointerEvent) => {
      if (hostRef.current && !hostRef.current.contains(e.target as Node)) set(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      set(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, closing, set]);

  const expanded = open && !closing;

  return (
    <div ref={hostRef} className={s.select}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        className={s.trigger}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-label={label}
        onClick={() => set(!expanded)}
      >
        {display}
        <ChevronIcon />
      </button>
      {open ? (
        <ul
          ref={menuRef}
          className={s.menu}
          data-side={side}
          data-closing={closing ? "" : undefined}
          role="listbox"
          aria-label={label}
        >
          {children(() => {
            set(false);
            document.getElementById(triggerId)?.focus();
          })}
        </ul>
      ) : null}
    </div>
  );
}

function optionKeys(event: ReactKeyboardEvent<HTMLElement>, pick: () => void) {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    pick();
  } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const sibling =
      event.key === "ArrowDown"
        ? event.currentTarget.nextElementSibling
        : event.currentTarget.previousElementSibling;
    (sibling as HTMLElement | null)?.focus();
  }
}

/* ---------------------------------------------------------------- *
 * Voice preview
 * ---------------------------------------------------------------- */

function useVoicePreview() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [duration, setDuration] = useState(2600);
  const timer = useRef<number | undefined>(undefined);

  const stop = () => {
    window.clearTimeout(timer.current);
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setPlaying(null);
  };

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  const toggle = (voice: VoiceChatVoice) => {
    if (playing === voice.id) {
      stop();
      return;
    }
    stop();
    const text = voice.sample ?? `Hi, I'm ${voice.name}. I'll keep things simple and quick.`;
    const rate = voice.rate ?? 1;
    const ms = Math.round((text.split(" ").length * 360) / rate) + 400;
    setDuration(ms);
    setPlaying(voice.id);
    const synth = "speechSynthesis" in window ? window.speechSynthesis : null;
    let spoken = !synth;
    let timed = false;
    const finish = () => {
      if (spoken && timed) setPlaying((p) => (p === voice.id ? null : p));
    };
    if (synth) {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "en-US";
      u.pitch = voice.pitch ?? 1;
      u.rate = rate;
      u.onend = u.onerror = () => {
        spoken = true;
        finish();
      };
      synth.speak(u);
    }
    timer.current = window.setTimeout(() => {
      timed = true;
      finish();
      timer.current = window.setTimeout(() => {
        spoken = true;
        finish();
      }, 6000);
    }, ms);
  };

  return { playing, duration, toggle };
}

/* ---------------------------------------------------------------- *
 * Step slider (Speed, Reasoning effort)
 * ---------------------------------------------------------------- */

const SLIDER_W = 88;
const SLIDER_PAD = 7;

function stepX(index: number, count: number) {
  return SLIDER_PAD + (index / (count - 1)) * (SLIDER_W - SLIDER_PAD * 2);
}

function StepSlider<T extends string | number>({
  label,
  steps,
  value,
  format,
  onChange,
}: {
  label: string;
  steps: readonly T[];
  value: T;
  format: (v: T) => string;
  onChange: (v: T) => void;
}) {
  const index = Math.max(0, steps.indexOf(value));
  const count = steps.length;
  const [drag, setDragState] = useState<number | null>(null);
  const dragRef = useRef<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const setDrag = (x: number | null) => {
    dragRef.current = x;
    setDragState(x);
  };

  const xFrom = (clientX: number) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r) return stepX(index, count);
    return Math.min(SLIDER_W - SLIDER_PAD, Math.max(SLIDER_PAD, clientX - r.left));
  };

  const nearest = (x: number) => {
    let best = 0;
    for (let i = 1; i < count; i++) {
      if (Math.abs(stepX(i, count) - x) < Math.abs(stepX(best, count) - x)) best = i;
    }
    return best;
  };

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* Pointer capture needs a trusted event. */
    }
    setDrag(xFrom(e.clientX));
  };

  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current === null) return;
    const x = xFrom(e.clientX);
    setDrag(x);
    const next = steps[nearest(x)];
    if (next !== value) onChange(next);
  };

  const onUp = () => {
    if (dragRef.current === null) return;
    onChange(steps[nearest(dragRef.current)]);
    setDrag(null);
  };

  const onKey = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(count - 1, index + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(0, index - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = count - 1;
    else return;
    e.preventDefault();
    onChange(steps[next]);
  };

  const x = drag ?? stepX(index, count);

  return (
    <div
      ref={trackRef}
      className={s.sliderTrack}
      data-dragging={drag !== null ? "" : undefined}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={count - 1}
      aria-valuenow={index}
      aria-valuetext={format(value)}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      <span className={s.sliderRail} style={{ left: SLIDER_PAD, right: SLIDER_PAD }} />
      <span className={s.sliderFill} style={{ left: SLIDER_PAD, width: x - SLIDER_PAD }} />
      {steps.map((v, i) => (
        <span
          key={v}
          className={s.sliderTick}
          data-filled={stepX(i, count) <= x + 0.5 ? "" : undefined}
          style={{ left: stepX(i, count) }}
        />
      ))}
      <span className={s.sliderThumb} style={{ left: x }} />
    </div>
  );
}

function RowValue({ children }: { children: string }) {
  return (
    <span className={s.rowValue} aria-hidden>
      <span key={children}>{children}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- *
 * Panels
 * ---------------------------------------------------------------- */

function InputRow({
  inputs,
  input,
  onInput,
  live,
  onMenu,
}: {
  inputs: VoiceChatInput[];
  input: string;
  onInput: (id: string) => void;
  live: boolean;
  onMenu: (open: boolean) => void;
}) {
  const current = inputs.find((d) => d.id === input) ?? inputs[0];

  return (
    <div className={s.row}>
      <span className={s.rowLabel}>
        Input
        <span className={`${s.live} ${s.inputLive}`} data-idle={live ? undefined : ""} aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </span>
      <Select label="Input" display={<span className={s.triggerText}>{current?.name}</span>} onOpenChange={onMenu}>
        {(close) =>
          inputs.map((d) => (
            <li
              key={d.id}
              role="option"
              aria-selected={d.id === current?.id}
              tabIndex={0}
              className={`${s.option} ${s.inputOption}`}
              onClick={() => {
                onInput(d.id);
                close();
              }}
              onKeyDown={(e) =>
                optionKeys(e, () => {
                  onInput(d.id);
                  close();
                })
              }
            >
              <span className={s.optionText}>{d.name}</span>
              {d.id === current?.id ? <CheckIcon /> : null}
            </li>
          ))
        }
      </Select>
    </div>
  );
}

function Settings({
  voices,
  voice,
  onVoice,
  speed,
  onSpeed,
  effort,
  onEffort,
  languages,
  language,
  onLanguage,
  inputs,
  input,
  onInput,
  inputLive,
  onMenu,
}: {
  voices: VoiceChatVoice[];
  voice: string;
  onVoice: (id: string) => void;
  speed: VoiceChatSpeed;
  onSpeed: (v: VoiceChatSpeed) => void;
  effort: VoiceChatEffort;
  onEffort: (v: VoiceChatEffort) => void;
  languages: string[];
  language: string;
  onLanguage: (l: string) => void;
  inputs: VoiceChatInput[];
  input: string;
  onInput: (id: string) => void;
  inputLive: boolean;
  onMenu: (open: boolean) => void;
}) {
  const preview = useVoicePreview();
  const current = voices.find((v) => v.id === voice) ?? voices[0];

  return (
    <div className={s.settings}>
      <div className={s.row}>
        <span className={s.rowLabel}>Voice</span>
        <Select label="Voice" display={current?.name} onOpenChange={onMenu}>
          {(close) =>
            voices.map((v) => (
              <li
                key={v.id}
                role="option"
                aria-selected={v.id === voice}
                tabIndex={0}
                className={`${s.option} ${s.voiceOption}`}
                onClick={() => {
                  onVoice(v.id);
                  close();
                }}
                onKeyDown={(e) =>
                  optionKeys(e, () => {
                    onVoice(v.id);
                    close();
                  })
                }
              >
                <button
                  type="button"
                  className={s.play}
                  data-playing={preview.playing === v.id ? "" : undefined}
                  style={{ "--dur": `${preview.duration}ms` } as CSSProperties}
                  aria-label={preview.playing === v.id ? `Stop ${v.name} preview` : `Play ${v.name} preview`}
                  onClick={(e) => {
                    e.stopPropagation();
                    preview.toggle(v);
                  }}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <svg className={s.ring} viewBox="0 0 24 24" fill="none" aria-hidden>
                    <circle className={s.ringTrack} cx="12" cy="12" r="11.25" strokeWidth="1.5" />
                    <circle
                      key={preview.playing === v.id ? "on" : "off"}
                      className={s.ringFill}
                      cx="12"
                      cy="12"
                      r="11.25"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      pathLength={1}
                    />
                  </svg>
                  <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden>
                    <path className={s.playGlyph} d="M3.4 1.9c0-.5.55-.8.97-.53l6.1 3.95c.38.25.38.81 0 1.06l-6.1 3.95c-.42.27-.97-.03-.97-.53Z" />
                    <g className={s.pauseGlyph}>
                      <rect x="2.6" y="2" width="2.3" height="8" rx="0.7" />
                      <rect x="7.1" y="2" width="2.3" height="8" rx="0.7" />
                    </g>
                  </svg>
                </button>
                <span className={s.optionText}>
                  <span>{v.name}</span>
                  <span className={s.optionHint}>{v.hint}</span>
                </span>
                {v.id === voice ? <CheckIcon /> : null}
              </li>
            ))
          }
        </Select>
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>
          Speed:
          <RowValue>{`${speed}×`}</RowValue>
        </span>
        <StepSlider label="Speed" steps={SPEEDS} value={speed} format={(v) => `${v}×`} onChange={onSpeed} />
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>
          Reasoning effort:
          <RowValue>{EFFORT_LABELS[effort]}</RowValue>
        </span>
        <StepSlider
          label="Reasoning effort"
          steps={EFFORTS}
          value={effort}
          format={(v) => EFFORT_LABELS[v]}
          onChange={onEffort}
        />
      </div>
      <div className={s.row}>
        <span className={s.rowLabel}>Language</span>
        <Select label="Language" display={language} onOpenChange={onMenu}>
          {(close) =>
            languages.map((l) => (
              <li
                key={l}
                role="option"
                aria-selected={l === language}
                tabIndex={0}
                className={s.option}
                onClick={() => {
                  onLanguage(l);
                  close();
                }}
                onKeyDown={(e) =>
                  optionKeys(e, () => {
                    onLanguage(l);
                    close();
                  })
                }
              >
                <span className={s.optionText}>{l}</span>
                {l === language ? <CheckIcon /> : null}
              </li>
            ))
          }
        </Select>
      </div>
      <InputRow inputs={inputs} input={input} onInput={onInput} live={inputLive} onMenu={onMenu} />
    </div>
  );
}

function Transcript({
  lines,
  speaker,
  userName,
  agentName,
}: {
  lines: Line[];
  speaker: VoiceChatSpeaker | null;
  userName: string;
  agentName: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const follow = useRef(() => {});
  const words = lines.reduce((n, l) => n + l.shown, 0);

  // Glide to the newest line instead of jumping, and fade the top edge in once lines scroll away.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let pinned = true;
    let raf = 0;
    let last = 0;
    let pos = 0;
    const mark = () => {
      if (el.scrollTop > 1) el.dataset.scrolled = "";
      else delete el.dataset.scrolled;
    };
    const step = (now: number) => {
      const target = el.scrollHeight - el.clientHeight;
      const dt = last ? Math.min(64, now - last) : 16;
      last = now;
      pos += (target - pos) * (1 - Math.exp(-dt / 110));
      if (Math.abs(target - pos) < 0.5) {
        el.scrollTop = target;
        raf = 0;
      } else {
        el.scrollTop = pos;
        raf = requestAnimationFrame(step);
      }
      mark();
    };
    const stop = () => {
      cancelAnimationFrame(raf);
      raf = 0;
    };
    const onScroll = () => {
      mark();
      if (!raf) pinned = el.scrollHeight - el.scrollTop - el.clientHeight < 56;
    };
    follow.current = () => {
      if (!pinned || raf || el.scrollHeight - el.clientHeight - el.scrollTop < 0.5) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        el.scrollTop = el.scrollHeight;
        mark();
        return;
      }
      pos = el.scrollTop;
      last = 0;
      raf = requestAnimationFrame(step);
    };

    el.scrollTop = el.scrollHeight;
    mark();
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", stop, { passive: true });
    el.addEventListener("touchstart", stop, { passive: true });
    return () => {
      stop();
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", stop);
      el.removeEventListener("touchstart", stop);
    };
  }, []);

  useLayoutEffect(() => {
    follow.current();
  }, [words, lines.length]);

  const visible = lines.filter((l) => l.shown > 0);

  return (
    <div ref={ref} className={s.transcript} aria-live="polite">
      {visible.length === 0 ? (
        <p className={s.empty}>Listening…</p>
      ) : (
        <ol className={s.lines}>
          {visible.map((l, i) => {
            const talking = i === visible.length - 1 && speaker === l.who && l.shown < l.words.length;
            return (
              <li key={l.id} className={s.line} data-who={l.who}>
                <span className={s.whoRow}>
                  <span className={s.who}>
                    {l.who === "agent" ? agentName : userName}
                    {talking ? (
                      <span className={s.live} aria-hidden>
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : null}
                  </span>
                  <time className={s.time}>{formatDuration(l.at)}</time>
                </span>
                <p className={s.text}>
                  {l.words.slice(0, l.shown).map((w, wi) => (
                    <span key={wi} className={s.word}>
                      {wi ? " " : ""}
                      {w}
                    </span>
                  ))}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}


/* ---------------------------------------------------------------- *
 * Voice Chat
 * ---------------------------------------------------------------- */

type Phase = "collapse" | "retract" | "gone";

/** Where a shared-layout morph starts or ends: the outer shape and the agent avatar, in viewport px. */
export interface VoiceChatMorph {
  box: DOMRect;
  agent: DOMRect;
}

export interface VoiceChatProps {
  /** Label for the user's lines in the transcript. */
  userName?: string;
  /** Label for the agent's lines in the transcript. */
  agentName?: string;
  voices?: VoiceChatVoice[];
  languages?: string[];
  /** Microphones offered under Settings → Input. */
  inputs?: VoiceChatInput[];
  defaultInput?: string;
  defaultVoice?: string;
  defaultSpeed?: VoiceChatSpeed;
  defaultEffort?: VoiceChatEffort;
  defaultLanguage?: string;
  defaultPanel?: VoiceChatPanel | null;
  defaultMuted?: boolean;
  /** Demo conversation streamed into the transcript. */
  script?: VoiceChatTurn[];
  onMuteChange?: (muted: boolean) => void;
  onEffortChange?: (effort: VoiceChatEffort) => void;
  /** Fires after the hang-up animation has finished, with the call length in ms. */
  onEnd?: (durationMs: number) => void;
  /**
   * Fire `onEnd` as soon as the bar has folded into the agent instead of fading out,
   * so the parent can morph the agent into something else (see `getVoiceChatMorph`).
   */
  handoff?: boolean;
  /** Grow out of this shape (for example the button that started the call) instead of the agent. */
  morphFrom?: VoiceChatMorph | null;
  className?: string;
  style?: CSSProperties;
}

const MORPH_MS = 480;
const MORPH_EASE = "cubic-bezier(0.32, 0.72, 0, 1)";

/** Reads the folded bar (the circle around the agent) so a parent can morph out of it. */
export function getVoiceChatMorph(host: HTMLElement | null): VoiceChatMorph | null {
  const root = host?.querySelector<HTMLElement>("[data-vc-root]");
  const agent = root?.querySelector<SVGSVGElement>("[data-vc-agent]");
  if (!root || !agent) return null;
  const r = root.getBoundingClientRect();
  return { box: new DOMRect(r.left, r.top, r.height, r.height), agent: agent.getBoundingClientRect() };
}

function centerOf(r: DOMRect) {
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

export function VoiceChat({
  userName = "You",
  agentName = "Agent",
  voices = VOICE_CHAT_VOICES,
  languages = VOICE_CHAT_LANGUAGES,
  inputs = VOICE_CHAT_INPUTS,
  defaultInput,
  defaultVoice,
  defaultSpeed = 1.25,
  defaultEffort = "medium",
  defaultLanguage,
  defaultPanel = null,
  defaultMuted = false,
  script = DEMO_SCRIPT,
  onMuteChange,
  onEffortChange,
  onEnd,
  handoff = false,
  morphFrom = null,
  className,
  style,
}: VoiceChatProps) {
  const [panel, setPanel] = useState<VoiceChatPanel | null>(defaultPanel);
  const [shown, setShown] = useState<VoiceChatPanel | null>(defaultPanel);
  const [muted, setMuted] = useState(defaultMuted);
  const [slash, setSlash] = useState<"none" | "static" | "in" | "out">(defaultMuted ? "static" : "none");
  const [voice, setVoice] = useState(defaultVoice ?? voices[0]?.id ?? "");
  const [speed, setSpeed] = useState<VoiceChatSpeed>(defaultSpeed);
  const [effort, setEffort] = useState<VoiceChatEffort>(defaultEffort);
  const [language, setLanguage] = useState(defaultLanguage ?? languages[0] ?? "");
  const [input, setInput] = useState(defaultInput ?? inputs[0]?.id ?? "default");
  const [menu, setMenu] = useState(false);
  const [phase, setPhase] = useState<Phase | null>(null);
  const [entering, setEntering] = useState(true);
  const [morphing] = useState(() => morphFrom !== null);
  const [pop, setPop] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const [speaker, setSpeaker] = useState<VoiceChatSpeaker | null>(null);
  const [innerH, setInnerH] = useState(0);
  const [tip, setTip] = useState<{ id: string; label: string; on: boolean } | null>(null);

  const maskId = `vc-mic-${useId().replace(/:/g, "")}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const barsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const gaugeRef = useRef<HTMLSpanElement>(null);
  const tipOpen = useRef(false);
  const signal = useRef<AgentSignal>({ who: null, level: 0, muted: defaultMuted });
  const speakerRef = useRef<VoiceChatSpeaker | null>(null);
  const mutedRef = useRef(muted);
  const speedRef = useRef(speed);
  const startedAt = useRef(0);
  const timers = useRef<number[]>([]);
  const morphRef = useRef(morphFrom);

  useEffect(() => {
    mutedRef.current = muted;
    speedRef.current = speed;
  }, [muted, speed]);

  useEffect(() => {
    startedAt.current = performance.now();
    const t = window.setTimeout(() => setEntering(false), 900);
    const pending = timers.current;
    return () => {
      window.clearTimeout(t);
      pending.forEach((id) => window.clearTimeout(id));
    };
  }, []);

  // Shared-layout entrance: the bar starts clipped to the source shape and the agent flies from its avatar.
  useLayoutEffect(() => {
    const from = morphRef.current;
    const root = rootRef.current;
    const agent = root?.querySelector<SVGSVGElement>("[data-vc-agent]");
    if (!from || !root || !agent) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = root.getBoundingClientRect();
    const b = from.box;
    const start = `inset(${b.top - r.top}px ${r.right - b.right}px ${r.bottom - b.bottom}px ${b.left - r.left}px round ${b.height / 2}px)`;
    const a = agent.getBoundingClientRect();
    const fromC = centerOf(from.agent);
    const toC = centerOf(a);
    const clip = root.animate([{ clipPath: start }, { clipPath: "inset(-1px round 25px)" }], {
      duration: MORPH_MS,
      easing: MORPH_EASE,
    });
    const fly = agent.animate(
      [
        { transform: `translate(${fromC.x - toC.x}px, ${fromC.y - toC.y}px) scale(${from.agent.width / a.width})` },
        { transform: "none" },
      ],
      { duration: MORPH_MS, easing: MORPH_EASE },
    );
    return () => {
      clip.cancel();
      fly.cancel();
    };
  }, []);

  // Scripted conversation: words arrive at speaking pace, user turns wait while muted.
  useEffect(() => {
    let alive = true;
    const sleep = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));
    const say = (who: VoiceChatSpeaker | null) => {
      speakerRef.current = who;
      setSpeaker(who);
    };
    void (async () => {
      await sleep(1100);
      if (!alive) return;
      setLines([]);
      for (let i = 0; i < script.length && alive; i++) {
        const turn = script[i];
        const words = turn.text.split(" ");
        while (alive && turn.who === "user" && mutedRef.current) await sleep(120);
        if (!alive) return;
        const at = performance.now() - startedAt.current;
        setLines((prev) => [...prev, { id: i, who: turn.who, words, shown: 0, at }]);
        say(turn.who);
        for (let w = 1; w <= words.length && alive; w++) {
          if (turn.who === "user" && mutedRef.current) {
            say(null);
            while (alive && mutedRef.current) await sleep(120);
            say(turn.who);
          }
          const base = turn.who === "agent" ? 270 / speedRef.current : 300;
          const pause = /[,.?!—]$/.test(words[w - 1]) ? 170 : 0;
          await sleep(base * (0.75 + Math.random() * 0.5) + pause);
          if (!alive) return;
          setLines((prev) => prev.map((l) => (l.id === i ? { ...l, shown: w } : l)));
        }
        say(null);
        await sleep(700);
      }
    })();
    return () => {
      alive = false;
      speakerRef.current = null;
    };
  }, [script]);

  // Voice level for the agent face and the waveform. Newest sample sits by the agent and scrolls right.
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let last = performance.now();
    let level = 0;
    const history = new Array<number>(BARS).fill(0);
    let sampledAt = last;

    const frame = (now: number) => {
      const dt = Math.min(0.064, (now - last) / 1000);
      last = now;
      const who = speakerRef.current;
      const voiced = who
        ? 0.44 +
          0.3 * Math.sin(now / 190) * Math.sin(now / 97 + 1.7) +
          0.12 * Math.sin(now / 61 + 0.4)
        : 0;
      level += (Math.max(0, voiced) - level) * Math.min(1, dt * (who ? 9 : 6));
      signal.current = { who, level, muted: mutedRef.current };

      if (now - sampledAt > 100) {
        sampledAt = now;
        history.pop();
        history.unshift(level * (0.8 + 0.2 * Math.sin(now / 130)));
        const bars = barsRef.current;
        for (let i = 0; i < bars.length; i++) {
          const el = bars[i];
          if (!el) continue;
          const v = history[i];
          el.style.height = `${(2 + v * 20).toFixed(2)}px`;
          el.style.opacity = (0.4 + Math.min(1, v * 2.4) * 0.6).toFixed(3);
        }
      }

      if (!reduce) raf = requestAnimationFrame(frame);
    };

    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    setInnerH(el.offsetHeight);
    const ro = new ResizeObserver(() => setInnerH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [shown]);

  // One shared tooltip that glides between the actions, like Message Actions.
  useLayoutEffect(() => {
    const bubble = bubbleRef.current;
    const gauge = gaugeRef.current;
    if (!bubble || !gauge || !tip) return;
    const show = tip.on && !phase;
    const btn = rootRef.current?.querySelector<HTMLElement>(`[data-action="${tip.id}"]`);
    if (!show || !btn) {
      delete bubble.dataset.up;
      tipOpen.current = false;
      return;
    }
    const place = (snap: boolean) => {
      gauge.textContent = tip.label;
      const r = btn.getBoundingClientRect();
      const w = Math.ceil(gauge.offsetWidth + 10);
      const h = Math.ceil(gauge.offsetHeight + 8);
      if (snap) bubble.dataset.hold = "true";
      bubble.style.setProperty("--cue-x", `${Math.round(r.left + r.width / 2 - w / 2)}px`);
      bubble.style.setProperty("--cue-y", `${Math.round(r.top - h - 6)}px`);
      bubble.style.setProperty("--cue-w", `${w}px`);
      if (snap) {
        void bubble.offsetWidth;
        delete bubble.dataset.hold;
      }
    };
    const theme = btn.closest("[data-theme]")?.getAttribute("data-theme");
    bubble.dataset.theme =
      theme === "dark" || (!theme && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
    bubble.textContent = tip.label;
    place(!tipOpen.current);
    bubble.dataset.up = "true";
    tipOpen.current = true;
    const follow = () => place(true);
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [tip, phase]);

  const togglePanel = (next: VoiceChatPanel) => {
    if (phase) return;
    if (panel === next) {
      setPanel(null);
      return;
    }
    setShown(next);
    setPanel(next);
    if (next === "transcript") setPop((n) => n + 1);
  };

  useEffect(() => {
    if (!pop) return;
    const t = window.setTimeout(() => setPop(0), 460);
    return () => window.clearTimeout(t);
  }, [pop]);

  const toggleMute = () => {
    if (phase) return;
    const next = !muted;
    setMuted(next);
    setSlash(next ? "in" : "out");
    onMuteChange?.(next);
  };

  const hangUp = () => {
    if (phase) return;
    const duration = performance.now() - startedAt.current;
    const hadPanel = panel !== null;
    setMenu(false);
    setPanel(null);
    setPhase("collapse");
    speakerRef.current = null;
    const at = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));
    const retract = hadPanel ? 280 : 120;
    at(retract, () => setPhase("retract"));
    if (handoff) {
      at(retract + 400, () => onEnd?.(duration));
      return;
    }
    at(retract + 400, () => setPhase("gone"));
    at(retract + 640, () => onEnd?.(duration));
  };

  const fadeStyle = (i: number) => ({ "--i": i }) as CSSProperties;
  const panelOpen = panel !== null && !phase;

  // The label is captured on hover, so a toggled button only shows its new label after re-entering.
  const action = (id: string, label: string) => ({
    "data-action": id,
    onPointerEnter: (e: ReactPointerEvent) => {
      if (e.pointerType === "mouse") setTip({ id, label, on: true });
    },
    onPointerLeave: () => setTip((t) => (t?.id === id ? { ...t, on: false } : t)),
  });
  const hideTip = () => setTip((t) => (t ? { ...t, on: false } : t));

  return (
    <div
      ref={rootRef}
      className={`${s.root}${className ? ` ${className}` : ""}`}
      style={style}
      data-vc-root=""
      data-phase={phase ?? undefined}
      data-entering={entering ? "" : undefined}
      data-morph={morphing ? "" : undefined}
      role="group"
      aria-label="Voice chat"
    >
      <div className={s.bar}>
        <AgentFace signal={signal} className={s.agent} />

        <div className={`${s.meter} ${s.fade}`} style={fadeStyle(1)} data-speaker={speaker ?? undefined} aria-hidden>
          {Array.from({ length: BARS }, (_, i) => (
            <span
              key={i}
              className={s.bit}
              ref={(node) => {
                barsRef.current[i] = node;
              }}
            />
          ))}
        </div>

        <div className={s.controls}>
          <button
            type="button"
            className={`${s.btn} ${s.fade}`}
            style={fadeStyle(2)}
            data-on={panel === "settings" ? "" : undefined}
            aria-label="Settings"
            aria-expanded={panel === "settings"}
            {...action("settings", "Settings")}
            onClick={() => {
              hideTip();
              togglePanel("settings");
            }}
          >
            <GearIcon />
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.fade}`}
            style={fadeStyle(3)}
            data-on={panel === "transcript" ? "" : undefined}
            data-typing={speaker && panel !== "transcript" && !pop ? "" : undefined}
            data-pop={pop ? "" : undefined}
            aria-label="Transcript"
            aria-expanded={panel === "transcript"}
            {...action("transcript", "Transcript")}
            onClick={() => {
              hideTip();
              togglePanel("transcript");
            }}
          >
            <TranscriptIcon />
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.mic} ${s.fade}`}
            style={fadeStyle(4)}
            data-on={muted ? "" : undefined}
            data-slash={slash}
            aria-label={muted ? "Unmute microphone" : "Mute microphone"}
            aria-pressed={muted}
            {...action("mic", muted ? "Unmute" : "Mute")}
            onClick={() => {
              hideTip();
              toggleMute();
            }}
          >
            <MicIcon maskId={maskId} />
          </button>
          <button
            type="button"
            className={`${s.btn} ${s.end} ${s.fade}`}
            style={fadeStyle(5)}
            aria-label="End call"
            {...action("end", "Hang up")}
            onClick={() => {
              hideTip();
              hangUp();
            }}
          >
            <HangUpIcon />
          </button>
        </div>
      </div>

      <div className={s.panel} data-vc-panel="" data-menu={menu ? "" : undefined} style={{ height: panelOpen ? innerH : 0 }}>
        {shown ? (
          <div key={shown} ref={innerRef} className={s.panelInner}>
            {shown === "settings" ? (
              <Settings
                voices={voices}
                voice={voice}
                onVoice={setVoice}
                speed={speed}
                onSpeed={setSpeed}
                effort={effort}
                onEffort={(v) => {
                  if (v === effort) return;
                  setEffort(v);
                  onEffortChange?.(v);
                }}
                languages={languages}
                language={language}
                onLanguage={setLanguage}
                inputs={inputs}
                input={input}
                onInput={setInput}
                inputLive={speaker === "user" && !muted}
                onMenu={setMenu}
              />
            ) : (
              <Transcript lines={lines} speaker={speaker} userName={userName} agentName={agentName} />
            )}
          </div>
        ) : null}
      </div>

      {tip
        ? createPortal(
            <>
              <span ref={gaugeRef} className={s.tipGauge} aria-hidden />
              <div ref={bubbleRef} className={s.tip} aria-hidden />
            </>,
            document.body,
          )
        : null}
    </div>
  );
}

/* ---------------------------------------------------------------- *
 * Site previews
 * ---------------------------------------------------------------- */

/** The resting state: a pill with the agent in it. Morphs out of the folded bar and back into it. */
function StartButton({
  from,
  onStart,
}: {
  from: VoiceChatMorph | null;
  onStart: (morph: VoiceChatMorph) => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const agentRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const fromRef = useRef(from);

  useLayoutEffect(() => {
    const el = ref.current;
    const agent = agentRef.current;
    const label = labelRef.current;
    const src = fromRef.current;
    if (!el || !agent || !label || !src) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const a = agent.getBoundingClientRect();
    const box = centerOf(src.box);
    const end = centerOf(r);
    const timing = { duration: MORPH_MS, easing: MORPH_EASE };
    const grow = el.animate(
      [
        {
          width: `${src.box.width}px`,
          height: `${src.box.height}px`,
          transform: `translate(${box.x - end.x}px, ${box.y - end.y}px)`,
        },
        { width: `${r.width}px`, height: `${r.height}px`, transform: "none" },
      ],
      timing,
    );
    // While the pill is still a circle its agent sits at the circle's left padding; fly it from the bar's agent.
    const startX = src.box.left + (a.left - r.left) + a.width / 2;
    const startY = box.y;
    const target = centerOf(src.agent);
    const fly = agent.animate(
      [
        { transform: `translate(${target.x - startX}px, ${target.y - startY}px) scale(${src.agent.width / a.width})` },
        { transform: "none" },
      ],
      timing,
    );
    const reveal = label.animate([{ opacity: 0, filter: "blur(2px)" }, { opacity: 1, filter: "none" }], {
      duration: 320,
      delay: 180,
      easing: "ease",
      fill: "backwards",
    });
    return () => {
      grow.cancel();
      fly.cancel();
      reveal.cancel();
    };
  }, []);

  return (
    <span className={s.startRow}>
      <button
        ref={ref}
        type="button"
        className={s.start}
        onClick={() => {
          const el = ref.current;
          const agent = agentRef.current?.querySelector("svg");
          if (!el || !agent) return;
          onStart({ box: el.getBoundingClientRect(), agent: agent.getBoundingClientRect() });
        }}
      >
        <span ref={agentRef} className={s.startAgent}>
          <AgentFace />
        </span>
        <span ref={labelRef}>Start voice chat</span>
      </button>
    </span>
  );
}

/** Detail page: hang up and the bar folds into a start button; press it and it unfolds again. */
/** A start button that morphs into the call bar and back when the call ends. */
export function VoiceChatLauncher() {
  const [session, setSession] = useState(0);
  const [ended, setEnded] = useState<number | null>(null);
  const [morph, setMorph] = useState<VoiceChatMorph | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={hostRef} className={`${s.startHost} ${s.stage}`}>
      {ended === null ? (
        <VoiceChat
          key={session}
          handoff
          morphFrom={morph}
          onEnd={(ms) => {
            setMorph(getVoiceChatMorph(hostRef.current));
            setEnded(ms);
          }}
        />
      ) : (
        <StartButton
          key={session}
          from={morph}
          onStart={(m) => {
            setMorph(m);
            setEnded(null);
            setSession((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}
