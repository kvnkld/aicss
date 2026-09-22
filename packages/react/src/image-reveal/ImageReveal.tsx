"use client";

import type { CSSProperties } from "react";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./ImageReveal.module.css";

export type ImageRevealVariant = "particles" | "bloom" | "spectrum";

export const IMAGE_REVEAL_VARIANTS: ImageRevealVariant[] = [
  "particles",
  "bloom",
  "spectrum",
];

export const IMAGE_REVEAL_LABELS: Record<ImageRevealVariant, string> = {
  particles: "Particles",
  bloom: "Bloom",
  spectrum: "Spectrum",
};

/**
 * A dramatic still that reads as a finished generation. Hosts can pass any
 * URL; this one is only a preview stand-in so the component can be dropped
 * into a docs page without extra assets.
 */
export const IMAGE_REVEAL_DEMO_SRC =
  "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1600&q=80";

const COLS = 10;
const ROWS = 7;

const DURATION: Record<ImageRevealVariant, number> = {
  particles: 1680,
  bloom: 1960,
  spectrum: 1580,
};

const PRELUDE_MS = 780;

type Phase = "generating" | "revealing" | "ready";

interface Cell {
  key: string;
  x: number;
  y: number;
  delay: number;
  gatherX: string;
  gatherY: string;
  drift: string;
}

function cells(): Cell[] {
  const out: Cell[] = [];
  const midX = (COLS - 1) / 2;
  const midY = (ROWS - 1) / 2;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const dx = x - midX;
      const dy = y - midY;
      const dist = Math.hypot(dx, dy);
      // Deterministic jitter so SSR and hydration agree.
      const jx = ((x * 37 + y * 17) % 11) - 5;
      const jy = ((x * 13 + y * 29) % 11) - 5;
      out.push({
        key: x + "," + y,
        x,
        y,
        delay: dist * 55,
        // Pull the generating field toward the centre, in % of the cell.
        gatherX: ((0.5 - (x + 0.5) / COLS) * COLS * 42 + jx).toFixed(1) + "%",
        gatherY: ((0.5 - (y + 0.5) / ROWS) * ROWS * 42 + jy).toFixed(1) + "%",
        drift: (8 + ((x * 5 + y * 3) % 10)).toFixed(1) + "%",
      });
    }
  }
  return out;
}

const CELLS = cells();

function preludeMs(prelude: boolean | number | undefined, hasSrc: boolean) {
  if (prelude === false) return 0;
  if (typeof prelude === "number") return Math.max(0, prelude);
  return hasSrc ? PRELUDE_MS : 0;
}

export interface ImageRevealProps {
  /** Finished generation. Omit or pass "" to keep the generating field on. */
  src?: string;
  alt?: string;
  /** `particles` grows the dots into the photo. `bloom` develops it from light. `spectrum` registers RGB plates. */
  variant?: ImageRevealVariant;
  /** Replay the choreography when this value changes. */
  replayKey?: string | number;
  /**
   * Dot prelude before the reveal. `true` (default when `src` is set) plays
   * a short generating beat so the reveal has something to start from.
   * `false` starts the reveal as soon as the image decodes.
   */
  prelude?: boolean | number;
  /** Override the variant duration, in ms. */
  duration?: number;
  aspectRatio?: string;
  /** Status label while generating. */
  label?: string;
  onRevealed?: () => void;
  className?: string;
  style?: CSSProperties;
}

export function ImageReveal({
  src,
  alt = "Generated image",
  variant = "particles",
  replayKey,
  prelude,
  duration,
  aspectRatio = "4 / 3",
  label = "Generating image",
  onRevealed,
  className,
  style,
}: ImageRevealProps) {
  const uid = useId().replace(/:/g, "");
  const filterR = "aicss-reveal-r-" + uid;
  const filterG = "aicss-reveal-g-" + uid;
  const filterB = "aicss-reveal-b-" + uid;

  const [phase, setPhase] = useState<Phase>("generating");
  const [readySrc, setReadySrc] = useState("");
  const onRevealedRef = useRef(onRevealed);
  onRevealedRef.current = onRevealed;

  const dur = duration ?? DURATION[variant];

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));

    setPhase("generating");
    setReadySrc("");

    if (!src) {
      return () => timers.forEach(clearTimeout);
    }

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const wait = preludeMs(prelude, true);

    const start = (decoded: string) => {
      if (cancelled) return;
      setReadySrc(decoded);
      if (reduced) {
        setPhase("ready");
        onRevealedRef.current?.();
        return;
      }
      at(wait, () => {
        if (cancelled) return;
        setPhase("revealing");
        at(dur, () => {
          if (cancelled) return;
          setPhase("ready");
          onRevealedRef.current?.();
        });
      });
    };

    const img = new Image();
    img.decoding = "async";
    img.src = src;
    const decoded = img.decode
      ? img.decode().then(() => src)
      : new Promise<string>((resolve, reject) => {
          img.onload = () => resolve(src);
          img.onerror = () => reject(new Error("image"));
        });

    decoded.then(start).catch(() => {
      if (!cancelled) start(src);
    });

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [src, variant, replayKey, prelude, dur]);

  const busy = phase !== "ready";
  const showPhoto = Boolean(readySrc) && phase !== "generating";

  return (
    <div
      className={styles.root + (className ? " " + className : "")}
      data-variant={variant}
      data-phase={phase}
      style={
        {
          "--reveal-cols": COLS,
          "--reveal-rows": ROWS,
          "--reveal-dur": dur + "ms",
          "--reveal-src": readySrc ? "url(\"" + readySrc.replace(/"/g, "") + "\")" : "none",
          aspectRatio,
          ...style,
        } as CSSProperties
      }
      role="img"
      aria-label={busy ? label : alt}
      aria-busy={busy}
    >
      <svg className={styles.filters} aria-hidden width="0" height="0">
        <filter id={filterR} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id={filterG} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0"
          />
        </filter>
        <filter id={filterB} colorInterpolationFilters="sRGB">
          <feColorMatrix
            type="matrix"
            values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0"
          />
        </filter>
      </svg>

      <div className={styles.stage}>
        {showPhoto && variant === "bloom" && (
          <>
            <div className={styles.haze + " " + styles.hazeCool} />
            <div className={styles.haze + " " + styles.hazeWarm} />
            <div className={styles.flare} />
          </>
        )}

        {showPhoto && variant === "spectrum" && (
          <div className={styles.plates}>
            <div
              className={styles.plate + " " + styles.plateR}
              style={{ "--plate-extract": "url(#" + filterR + ")" } as CSSProperties}
            />
            <div
              className={styles.plate + " " + styles.plateG}
              style={{ "--plate-extract": "url(#" + filterG + ")" } as CSSProperties}
            />
            <div
              className={styles.plate + " " + styles.plateB}
              style={{ "--plate-extract": "url(#" + filterB + ")" } as CSSProperties}
            />
          </div>
        )}

        {readySrc && (
          <img
            className={styles.photo}
            src={readySrc}
            alt=""
            draggable={false}
          />
        )}

        <div className={styles.field} aria-hidden>
          {CELLS.map((c) => (
            <span
              key={c.key}
              className={styles.cell}
              style={
                {
                  "--x": c.x,
                  "--y": c.y,
                  "--delay": c.delay + "ms",
                  "--gx": c.gatherX,
                  "--gy": c.gatherY,
                  "--drift": c.drift,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Usage:
       <ImageReveal src={url} alt="Glass pavilion at dusk" />
       <ImageReveal src={url} variant="bloom" />
       <ImageReveal src={url} variant="spectrum" replayKey={n} />
       <ImageReveal src={url} prelude={false} />
       <ImageReveal /> // generating field until src arrives
*/
