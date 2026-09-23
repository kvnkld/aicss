"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import s from "./ReasoningEffort.module.css";

const STOPS = ["Low", "Medium", "High", "Extra High"] as const;
const MODEL = "4.7";
const TRACK = 224;
const HEIGHT = 32;
const RADIUS = HEIGHT / 2;
const BUMP_H = 20;
const REST_W = 27.2;
const DRAG_W = 33.6;
const REST_H = 27.2;
const EDGE_PAD = (HEIGHT - REST_H) / 2;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function centerFor(value: number) {
  const span = TRACK - RADIUS * 2;
  return RADIUS + (value / (STOPS.length - 1)) * span;
}

function easeOut(t: number) {
  return 1 - (1 - t) ** 3;
}

const LEFT_SHOULDER = 23.572;
/** Space from each glyph edge to the foot of the label shoulder. */
const TEXT_SIDE = 20;
/** How far the outer foot walks down the cap once it passes the crown. */
const PHI_MAX = 0.6;
const PHI_REACH = 36;

function plateauFor(textW: number) {
  return Math.max(8, textW + TEXT_SIDE * 2 - LEFT_SHOULDER * 2);
}

function smoothstep(t: number) {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
}

function capFoot(side: -1 | 1, phi: number) {
  const crown = side === -1 ? RADIUS : TRACK - RADIUS;
  return {
    x: crown + side * RADIUS * Math.sin(phi),
    y: BUMP_H + RADIUS * (1 - Math.cos(phi)),
  };
}

function shellGeom(cx: number, plateauW: number) {
  const crownL = RADIUS;
  const crownR = TRACK - RADIUS;
  let topL = cx - plateauW / 2;
  let topR = topL + plateauW;
  let phiL = 0;
  let phiR = 0;

  const overflowL = crownL - (topL - LEFT_SHOULDER);
  if (overflowL > 0) {
    phiL = PHI_MAX * smoothstep(overflowL / PHI_REACH);
    const foot = capFoot(-1, phiL);
    const minTopL = foot.x + LEFT_SHOULDER * Math.cos(phiL);
    if (topL < minTopL) {
      topR += minTopL - topL;
      topL = minTopL;
    }
  }

  const overflowR = topR + LEFT_SHOULDER - crownR;
  if (overflowR > 0) {
    phiR = PHI_MAX * smoothstep(overflowR / PHI_REACH);
    const foot = capFoot(1, phiR);
    const maxTopR = foot.x - LEFT_SHOULDER * Math.cos(phiR);
    if (topR > maxTopR) {
      topL -= topR - maxTopR;
      topR = maxTopR;
    }
  }

  // The tilted shoulder is shorter in x, which would pull the text onto the
  // outer edge. Grow the plateau inward by that loss and keep the label with it.
  const insetL = phiL > 0 ? LEFT_SHOULDER * (1 - Math.cos(phiL)) : 0;
  const insetR = phiR > 0 ? LEFT_SHOULDER * (1 - Math.cos(phiR)) : 0;
  topR += insetL;
  topL -= insetR;

  return { topL, topR, phiL, phiR, insetL, insetR };
}

/** Reference shoulder. phi tilts the foot onto the cap tangent; 0 is the flat scoop. */
function shoulderCmds(
  footX: number,
  footY: number,
  platX: number,
  platY: number,
  phi: number,
  dir: 1 | -1,
) {
  const xScale = Math.abs(platX - footX) / LEFT_SHOULDER;
  const yScale = Math.max(0.001, (footY - platY) / 20);
  const tangent = { x: dir * Math.cos(phi), y: -Math.sin(phi) };
  const map = (lx: number, ly: number) => ({
    x: footX + dir * lx * xScale,
    y: footY + (ly - 20) * yScale,
  });
  const h1 = 5.398 * xScale;
  const p0 = { x: footX, y: footY };
  const c1 = { x: footX + tangent.x * h1, y: footY + tangent.y * h1 };
  const c2 = map(10.012, 16.114);
  const p1 = map(10.93, 10.794);
  const c3 = map(11.916, 4.577);
  const c4 = map(17.277, 0);
  const p3 = { x: platX, y: platY };
  const fmt = (p: { x: number; y: number }) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
  if (dir === 1) return `C${fmt(c1)} ${fmt(c2)} ${fmt(p1)}C${fmt(c3)} ${fmt(c4)} ${fmt(p3)}`;
  return `C${fmt(c4)} ${fmt(c3)} ${fmt(p1)}C${fmt(c2)} ${fmt(c1)} ${fmt(p0)}`;
}

/** One outline: the pill, with the label shoulder grown out of its top edge. */
function shellPath(cx: number, open: number, plateauW: number) {
  const trackTop = BUMP_H;
  const trackBot = BUMP_H + HEIGHT;
  const crownL = RADIUS;
  const crownR = TRACK - RADIUS;
  if (open < 0.012) {
    return `M${crownL} ${trackTop}H${crownR}A${RADIUS} ${RADIUS} 0 0 1 ${crownR} ${trackBot}H${crownL}A${RADIUS} ${RADIUS} 0 0 1 ${crownL} ${trackTop}Z`;
  }

  const bumpTop = BUMP_H * (1 - open);
  const { topL, topR, phiL, phiR } = shellGeom(cx, plateauW);
  const cmds = [`M${crownL} ${trackBot}`];

  if (phiL > 0.001) {
    const foot = capFoot(-1, phiL);
    cmds.push(`A${RADIUS} ${RADIUS} 0 0 1 ${foot.x.toFixed(2)} ${foot.y.toFixed(2)}`);
    cmds.push(shoulderCmds(foot.x, foot.y, topL, bumpTop, phiL, 1));
  } else {
    cmds.push(`A${RADIUS} ${RADIUS} 0 0 1 ${crownL} ${trackTop}`);
    const footL = topL - LEFT_SHOULDER;
    if (footL > crownL + 0.4) cmds.push(`H${footL.toFixed(2)}`);
    cmds.push(shoulderCmds(footL, trackTop, topL, bumpTop, 0, 1));
  }

  if (topR > topL + 0.4) cmds.push(`H${topR.toFixed(2)}`);

  if (phiR > 0.001) {
    const foot = capFoot(1, phiR);
    cmds.push(shoulderCmds(foot.x, foot.y, topR, bumpTop, phiR, -1));
    cmds.push(`A${RADIUS} ${RADIUS} 0 0 1 ${crownR} ${trackBot}`);
  } else {
    const footR = topR + LEFT_SHOULDER;
    cmds.push(shoulderCmds(footR, trackTop, topR, bumpTop, 0, -1));
    if (footR < crownR - 0.4) cmds.push(`H${crownR}`);
    cmds.push(`A${RADIUS} ${RADIUS} 0 0 1 ${crownR} ${trackBot}`);
  }

  cmds.push(`H${crownL}Z`);
  return cmds.join("");
}


export function ReasoningEffort() {
  const rootRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const valueRef = useRef(1);
  const displayRef = useRef(1);
  const openRef = useRef(0);
  const draggingRef = useRef(false);
  const [display, setDisplay] = useState(1);
  const [open, setOpen] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [textW, setTextW] = useState(64);
  const plateauTarget = plateauFor(textW);
  const plateauRef = useRef(plateauTarget);
  const [plateauW, setPlateauW] = useState(plateauTarget);
  const revealRef = useRef(0);
  const [reveal, setReveal] = useState(0);
  const gradId = useId().replace(/:/g, "");

  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const read = () => {
      const marked = el.parentElement?.closest("[data-theme]");
      if (marked) {
        setTheme(marked.getAttribute("data-theme") === "dark" ? "dark" : "light");
        return;
      }
      if (el.closest(".dark")) {
        setTheme("dark");
        return;
      }
      setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    };
    read();
    const marked = el.parentElement?.closest("[data-theme]");
    const obs = new MutationObserver(read);
    if (marked) obs.observe(marked, { attributes: true, attributeFilter: ["data-theme"] });
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", read);
    return () => {
      obs.disconnect();
      media.removeEventListener("change", read);
    };
  }, []);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const toOpen = dragging ? 1 : 0;
    const fromOpen = openRef.current;
    const fromValue = displayRef.current;
    const targetValue = dragging ? fromValue : Math.round(valueRef.current);
    if (reduce) {
      openRef.current = toOpen;
      setOpen(toOpen);
      if (!dragging) {
        valueRef.current = targetValue;
        displayRef.current = targetValue;
        setDisplay(targetValue);
      }
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 220);
      const e = easeOut(t);
      const nextOpen = fromOpen + (toOpen - fromOpen) * e;
      openRef.current = nextOpen;
      setOpen(nextOpen);
      if (!dragging) {
        const nextValue = fromValue + (targetValue - fromValue) * e;
        displayRef.current = nextValue;
        setDisplay(nextValue);
        if (t === 1) {
          valueRef.current = targetValue;
          displayRef.current = targetValue;
        }
      }
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const from = plateauRef.current;
    const to = plateauTarget;
    if (reduce || Math.abs(to - from) < 0.3) {
      plateauRef.current = to;
      setPlateauW(to);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / 90);
      const next = from + (to - from) * easeOut(t);
      plateauRef.current = next;
      setPlateauW(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [plateauTarget]);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const to = dragging ? 1 : 0;
    const from = revealRef.current;
    if (reduce) {
      revealRef.current = to;
      setReveal(to);
      return;
    }
    const delay = dragging ? 85 : 0;
    const dur = dragging ? 132 : 90;
    const start = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const elapsed = now - start - delay;
      if (elapsed < 0) {
        raf = requestAnimationFrame(step);
        return;
      }
      const t = Math.min(1, elapsed / dur);
      const next = from + (to - from) * easeOut(t);
      revealRef.current = next;
      setReveal(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dragging]);

  function commit(next: number) {
    valueRef.current = next;
    displayRef.current = next;
    setDisplay(next);
  }

  function valueFrom(clientX: number) {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return valueRef.current;
    const t = (clientX - rect.left - RADIUS) / (rect.width - RADIUS * 2);
    return clamp(t * (STOPS.length - 1), 0, STOPS.length - 1);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    draggingRef.current = true;
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* Pointer capture needs a trusted event. */
    }
    setDragging(true);
    commit(valueFrom(event.clientX));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    commit(valueFrom(event.clientX));
  }

  function onPointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      /* Ignore when the event was not trusted. */
    }
    setDragging(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const max = STOPS.length - 1;
    const current = Math.round(valueRef.current);
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") next = Math.min(max, current + 1);
    else if (event.key === "ArrowLeft" || event.key === "ArrowDown") next = Math.max(0, current - 1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = max;
    else return;
    event.preventDefault();
    commit(next);
  }

  const center = centerFor(display);
  const thumbW = REST_W + (DRAG_W - REST_W) * open;
  const thumbH = REST_H;
  const outerPad = EDGE_PAD;
  let thumbLeft = center - thumbW / 2;
  let thumbRight = thumbLeft + thumbW;
  if (thumbLeft < outerPad) {
    thumbLeft = outerPad;
    thumbRight = thumbLeft + thumbW;
  }
  if (thumbRight > TRACK - outerPad) {
    thumbRight = TRACK - outerPad;
    thumbLeft = thumbRight - thumbW;
  }
  const fillW = Math.min(TRACK, thumbRight + EDGE_PAD);
  const active = Math.round(display);
  const level = STOPS[active];
  const tickHeights = [4.8, 6.4, 8, 9.6];
  const plateau = shellGeom(center, plateauW);
  const labelX =
    (plateau.topL + plateau.topR) / 2 + (plateau.insetL - plateau.insetR) / 2;

  useLayoutEffect(() => {
    const w = labelRef.current?.getBoundingClientRect().width ?? 0;
    if (w > 0 && Math.abs(w - textW) > 0.4) setTextW(w);
  }, [level, theme, textW]);

  return (
    <div
      ref={rootRef}
      className={s.root}
      data-theme={theme}
      data-dragging={dragging ? "true" : "false"}
    >
      <svg
        className={s.shell}
        viewBox={`0 0 ${TRACK} ${BUMP_H + HEIGHT}`}
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--ss-shell)" />
            <stop offset="1" stopColor="var(--ss-shell-2)" />
          </linearGradient>
        </defs>
        <path
          d={shellPath(center, open, plateauW)}
          fill={`url(#${gradId})`}
          stroke="var(--ss-line)"
          strokeWidth="0.5"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        ref={labelRef}
        className={s.label}
        style={{
          left: labelX,
          opacity: reveal,
          filter: reveal > 0.98 ? undefined : `blur(${((1 - reveal) * 3).toFixed(2)}px)`,
          transform: `translate(-50%, ${3 * (1 - open)}px)`,
        }}
      >
        <span key={level} className={s.swap}>
          <span className={s.current}>{MODEL}</span>
          <span className={s.next}>{level}</span>
        </span>
      </div>
      <div
        ref={trackRef}
        className={s.track}
        role="slider"
        tabIndex={0}
        aria-label="Reasoning effort"
        aria-valuemin={0}
        aria-valuemax={STOPS.length - 1}
        aria-valuenow={active}
        aria-valuetext={`${MODEL} ${level}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        <div className={s.fill} style={{ width: fillW }} />
        <div
          className={s.thumb}
          style={{
            left: thumbLeft,
            width: thumbW,
            height: thumbH,
            marginTop: -thumbH / 2,
          }}
        />
        {STOPS.map((label, index) => {
          const x = centerFor(index);
          const onThumb = x >= thumbLeft + 0.5 && x <= thumbRight - 0.5;
          return (
            <span
              key={label}
              className={s.tick}
              data-on-thumb={onThumb ? "true" : "false"}
              data-active={index === active && !onThumb ? "true" : "false"}
              style={{ left: x, height: tickHeights[index] }}
            />
          );
        })}
      </div>
    </div>
  );
}
