/* ---------------------------------------------------------------- *
 * Public API
 * ---------------------------------------------------------------- */

export type AiBotEmotion =
  | "neutral"
  | "happy"
  | "love"
  | "laugh"
  | "surprised"
  | "sad"
  | "thinking"
  | "sleepy"
  | "wink";
export type AiBotMotion = "jump" | "spin" | "bounce" | "wiggle" | "float";
export type AiBotActivity = "idle" | "speaking" | "listening";
export type AiBotShape = "pebble" | "circle" | "squircle" | "flower" | "blob";

export const AI_BOT_EMOTIONS: AiBotEmotion[] = [
  "neutral",
  "laugh",
  "surprised",
  "wink",
  "happy",
  "thinking",
  "love",
  "sad",
  "sleepy",
];
export const AI_BOT_MOTIONS: AiBotMotion[] = ["jump", "spin", "bounce", "float", "wiggle"];
export const AI_BOT_SHAPES: AiBotShape[] = ["pebble", "circle", "squircle", "flower", "blob"];

/* ---------------------------------------------------------------- *
 * Geometry (body in viewBox -16 -16 32 32)
 * ---------------------------------------------------------------- */

const R0 = 13.4;
const POINTS = 96;
const EYES = [-3.2, 3.2];
const EYE_Y = -2.6;
const EYE_W = 2.4;
const EYE_H = 5.4;
const MOUTH_Y = 4.4;
const MORPH_MS = 380;
const GROUND_Y = R0 + 0.5;
const HEARTS = 4;
const HEART_EVERY = 2800;
const HEART_LIFE = 2200;
const HEART =
  "M0 1C-0.6 0.55-1.3 0.1-1.3-0.45C-1.3-0.95-0.9-1.2-0.55-1.2C-0.25-1.2-0.05-1 0-0.8C0.05-1 0.25-1.2 0.55-1.2C0.9-1.2 1.3-0.95 1.3-0.45C1.3 0.1 0.6 0.55 0 1Z";

const smoothstep = (t: number) => t * t * (3 - 2 * t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const easeOut = (t: number) => 1 - (1 - t) ** 3;
/** A half-sine from `a` to `b`, zero outside. */
const bump = (t: number, a: number, b: number) => (t <= a || t >= b ? 0 : Math.sin((Math.PI * (t - a)) / (b - a)));
/** Eases in over a→b, holds, eases out over c→d. */
const hold = (t: number, a: number, b: number, c: number, d: number) =>
  t <= a || t >= d ? 0 : t < b ? smoothstep((t - a) / (b - a)) : t <= c ? 1 : 1 - smoothstep((t - c) / (d - c));
/** Stable pseudo-random 0–1 per integer, so each repeat of a cycle varies but never jitters. */
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/** Radius at angle `th` as a multiple of R0. Every shape samples the same angles, so any two can blend. */
function radius(shape: AiBotShape, th: number, t: number, level: number) {
  const c = Math.cos;
  switch (shape) {
    case "circle":
      return 0.97 + (0.012 + level * 0.03) * c(3 * th + t * 0.5) + 0.008 * c(5 * th - t * 0.6);
    case "squircle": {
      const x = Math.abs(c(th));
      const y = Math.abs(Math.sin(th));
      return 0.9 / (x ** 4 + y ** 4) ** 0.25 + (0.008 + level * 0.02) * c(4 * th + t * 0.6);
    }
    case "flower":
      return 0.95 + (0.075 + level * 0.03) * c(8 * th) + 0.012 * c(3 * th + t * 0.6);
    case "blob":
      // The two-lobe term stretches the body into an oval, so it stays small to keep the blob from going thin.
      // The three-lobe phase only sways around tip-up: past ±60° the triangle stands on its tip.
      return (
        0.97 +
        (0.05 + level * 0.025) * c(3 * th + 1.5 * Math.PI + 0.75 * Math.sin(t * 0.3) + 0.25 * Math.sin(t * 0.71)) +
        (0.022 + level * 0.012) * c(2 * th - t * 0.36) +
        0.01 * c(5 * th + t * 0.5)
      );
    default:
      // The five-lobe phase only sways around corner-up, so two corners always rest on the floor; past ±36° one would.
      return (
        1 +
        (0.038 + level * 0.03) * c(5 * th + 0.5 * Math.PI + 0.75 * Math.sin(t * 0.27) + 0.25 * Math.sin(t * 0.63)) +
        (0.02 + level * 0.02) * c(3 * th + t * 0.45) +
        0.01 * c(7 * th - t * 0.6)
      );
  }
}

function bodyPath(r: Float32Array) {
  let d = "";
  for (let i = 0; i < POINTS; i++) {
    const th = (i / POINTS) * Math.PI * 2;
    const k = r[i] * R0;
    d += `${i ? "L" : "M"}${(k * Math.cos(th)).toFixed(2)} ${(k * Math.sin(th)).toFixed(2)}`;
  }
  return `${d}Z`;
}

const ROUND_BODY = bodyPath(new Float32Array(POINTS).fill(1));

/**
 * An upright oval (squashed by `open`) that blends into a laughing crescent as `laugh` goes to 1.
 * `lidL` / `lidR` lower the top of the eye on that side, like a heavy or drooping eyelid.
 */
function eyePath(x: number, y: number, open: number, laugh: number, scale: number, lidL: number, lidR: number) {
  const a = (EYE_W / 2) * scale;
  const b = Math.max(0.35, (EYE_H / 2) * open * scale) * (4 / 3);
  const oval = [x - a, y, x - a, y - b * (1 - lidL), x + a, y - b * (1 - lidR), x + a, y, x + a, y + b, x - a, y + b];
  const cy = y + 0.4;
  const happy = [x - 1.7, cy + 1, x - 1.5, cy - 1.6, x + 1.5, cy - 1.6, x + 1.7, cy + 1, x + 1.1, cy - 0.3, x - 1.1, cy - 0.3];
  const p = oval.map((v, i) => (v + (happy[i] - v) * laugh).toFixed(2));
  return `M${p[0]} ${p[1]}C${p[2]} ${p[3]} ${p[4]} ${p[5]} ${p[6]} ${p[7]}C${p[8]} ${p[9]} ${p[10]} ${p[11]} ${p[0]} ${p[1]}Z`;
}

/**
 * Closed, a stroke curved by `smile` (-1 frown, 1 grin); open, the lips part into a filled mouth.
 * `skew` lifts the right corner and drops the left, for a smirk or a pursed, thinking mouth.
 * `taper` fills the closed mouth into a crescent, full in the middle and thin at the corners.
 */
function mouthPath(cx: number, cy: number, open: number, smile: number, width: number, skew: number, taper = 0) {
  const w = (2 + smile * 0.8 - open * 0.3) * width;
  const ends = cy - smile * 0.4;
  // A frown needs a deeper arch than a smile to read at icon sizes.
  const curve = cy + 0.4 + smile * (smile < 0 ? 2.4 : 1.6);
  const low = curve + open * 1.8 + taper;
  const up = curve - open * 2.4 - taper;
  const f = (n: number) => n.toFixed(2);
  const l = ends + skew;
  const r = ends - skew;
  return `M${f(cx - w)} ${f(l)}Q${f(cx)} ${f(low)} ${f(cx + w)} ${f(r)}Q${f(cx)} ${f(up)} ${f(cx - w)} ${f(l)}Z`;
}

/* ---------------------------------------------------------------- *
 * Expressions: the resting face of each feeling
 * ---------------------------------------------------------------- */

interface Expression {
  openL: number;
  openR: number;
  laughL: number;
  laughR: number;
  eyeScale: number;
  eyeY: number;
  /** Both upper lids lowered (tired, unimpressed). */
  heavy: number;
  /** Outer upper lids lowered (sad). */
  droop: number;
  smile: number;
  mouth: number;
  mouthW: number;
  mouthX: number;
  skew: number;
  /** Closed lips drawn as a crescent that thins out toward the corners. */
  taper: number;
  blush: number;
  /** Where the eyes rest; NaN leaves the gaze to the idle script. */
  gazeX: number;
  gazeY: number;
  wobble: number;
  bob: number;
  tilt: number;
  spin: number;
}

const BASE: Expression = {
  openL: 1,
  openR: 1,
  laughL: 0,
  laughR: 0,
  eyeScale: 1,
  eyeY: 0,
  heavy: 0,
  droop: 0,
  smile: 0.4,
  mouth: 0,
  mouthW: 1,
  mouthX: 0,
  skew: 0,
  taper: 0,
  blush: 0,
  gazeX: Number.NaN,
  gazeY: Number.NaN,
  wobble: 0,
  bob: 0,
  tilt: 0,
  spin: 1,
};

const EXPRESSIONS: Record<AiBotEmotion, Expression> = {
  neutral: BASE,
  // Real smiles reach the eyes: the cheeks push the lower lids up into a soft curve.
  happy: { ...BASE, openL: 0.9, openR: 0.9, laughL: 0.45, laughR: 0.45, smile: 1, wobble: 0.15, bob: -0.3 },
  // Lovestruck: soft, half-melted eyes drifting up and to the left, daydreaming, a full smile and flushed cheeks.
  love: {
    ...BASE,
    openL: 0.88,
    openR: 0.88,
    laughL: 0.55,
    laughR: 0.55,
    eyeScale: 1.03,
    smile: 1,
    mouthW: 0.9,
    blush: 1,
    gazeX: -0.6,
    gazeY: -0.7,
    wobble: 0.12,
    bob: -0.2,
    tilt: -3,
    spin: 0.7,
  },
  laugh: { ...BASE, openL: 0.9, openR: 0.9, laughL: 0.5, laughR: 0.5, smile: 1, mouth: 0.1, wobble: 0.3, spin: 1.4 },
  surprised: {
    ...BASE,
    openL: 1.03,
    openR: 1.03,
    eyeScale: 1.07,
    eyeY: -0.5,
    smile: 0,
    mouth: 1,
    mouthW: 0.95,
    wobble: 0.12,
    bob: -0.6,
  },
  sad: {
    ...BASE,
    openL: 0.75,
    openR: 0.75,
    eyeScale: 0.92,
    droop: 0.85,
    eyeY: 0.5,
    smile: -1,
    mouthW: 1.75,
    gazeX: 0,
    gazeY: 0.75,
    bob: 0.8,
    tilt: -4,
    spin: 0.35,
  },
  thinking: {
    ...BASE,
    openL: 0.95,
    openR: 0.8,
    heavy: 0.2,
    smile: 0.1,
    mouthW: 0.6,
    mouthX: 0.9,
    skew: 0.5,
    tilt: 5,
    spin: 0.6,
  },
  sleepy: {
    ...BASE,
    openL: 0.6,
    openR: 0.6,
    heavy: 0.65,
    eyeY: 0.5,
    smile: -0.04,
    mouthW: 0.8,
    taper: 0.3,
    gazeX: 0,
    gazeY: 0.6,
    bob: 0.5,
    spin: 0.3,
  },
  wink: { ...BASE, smile: 0.9, skew: 0.1, tilt: 2, wobble: 0.1 },
};

/** How fast each expression settles in: surprise snaps, sadness and sleep seep in. */
const SETTLE: Partial<Record<AiBotEmotion, number>> = { surprised: 16, sad: 3.5, sleepy: 2.5 };

const KEYS = Object.keys(BASE) as (keyof Expression)[];

/* ---------------------------------------------------------------- *
 * Acts: what a feeling does over time, on top of its resting face
 * ---------------------------------------------------------------- */

interface Act {
  dy: number;
  sy: number;
  tilt: number;
  /** Moves the whole face down, as when the head pitches forward. */
  faceY: number;
  scale: number;
  openL: number;
  openR: number;
  laughL: number;
  laughR: number;
  mouth: number;
  smile: number;
  width: number;
  skew: number;
  mouthX: number;
  yawn: number;
  /** 0–1 lid closure on top of the natural blinks. */
  blink: number;
  /** Holds back natural blinks (a stare, or eyes already shut). */
  steady: boolean;
  gaze: readonly [number, number] | null;
}

const still = (): Act => ({
  dy: 0,
  sy: 0,
  tilt: 0,
  faceY: 0,
  scale: 0,
  openL: 1,
  openR: 1,
  laughL: 0,
  laughR: 0,
  mouth: 0,
  smile: 0,
  width: 1,
  skew: 0,
  mouthX: 0,
  yawn: 0,
  blink: 0,
  steady: false,
  gaze: null,
});

const PONDER = [
  [0.75, -0.85],
  [0.4, -1],
  [-0.35, -0.85],
] as const;

function act(emotion: AiBotEmotion, age: number, now: number): Act {
  const a = still();
  switch (emotion) {
    case "happy": {
      if (age < 520) a.dy = -1.6 * Math.abs(Math.sin((Math.PI * 2 * age) / 520));
      a.tilt = 3 * Math.sin((Math.PI * 2 * age) / 3600);
      // Every few seconds the smile beams: cheeks lift further and the lips part.
      const beam = hold(age % 3600, 1600, 1900, 2500, 2900);
      a.laughL = a.laughR = 0.3 * beam;
      a.mouth = 0.22 * beam;
      a.dy -= 0.6 * beam;
      break;
    }
    case "love": {
      // A dreamy sway, and every few seconds a lovestruck sigh: the eyes melt, the chest lifts, the lips part.
      if (age < 600) a.dy = -1.4 * bump(age, 0, 600);
      a.tilt = 5 * Math.sin((Math.PI * 2 * age) / 4000);
      const sigh = hold(age % 4000, 1400, 1900, 2500, 3200);
      a.laughL = a.laughR = 0.3 * sigh;
      a.scale += 0.05 * sigh;
      a.sy += 0.03 * sigh;
      a.dy -= 0.8 * sigh;
      a.mouth += 0.1 * sigh;
      break;
    }
    case "laugh": {
      // Breath in, a burst of "ha"s that slows and fades, a few chuckles, then a breath out. Repeats, never the same.
      const L = 5600;
      const n = Math.floor(age / L);
      const c = age % L;
      const lean = hash(n) < 0.5 ? -1 : 1;
      const inhale = bump(c, 0, 340);
      a.dy -= 1.2 * inhale;
      a.sy += 0.04 * inhale;
      a.scale += 0.1 * inhale;
      a.laughL = a.laughR = -0.5 * inhale;
      a.mouth += 0.25 * inhale;
      const shut = hold(c, 220, 380, 3000, 3700);
      a.laughL += 0.5 * shut;
      a.laughR += 0.5 * shut;
      a.mouth += 0.25 * hold(c, 220, 400, 3400, 4400);
      if (c > 260 && c < 2900) {
        const q = (c - 260) / 2640;
        const phase = 15 * q - 3 * q * q;
        const ha = Math.abs(Math.sin(Math.PI * phase)) ** 0.8;
        const amp = (1 - 0.7 * q) * (0.6 + 0.4 * hash(n * 17 + Math.floor(phase))) * smoothstep(Math.min(1, (c - 260) / 120));
        a.mouth += 0.6 * ha * amp;
        a.dy -= 1.4 * ha * amp;
        a.sy -= 0.035 * ha * amp;
        a.scale -= 0.1 * ha * amp;
        a.tilt += 2.5 * ha * amp * lean;
      } else if (c >= 2900 && c < 4300) {
        const q = (c - 2900) / 1400;
        const ha = Math.abs(Math.sin(Math.PI * q * 4.2));
        const amp = 0.4 * (1 - q);
        a.mouth += 0.4 * ha * amp;
        a.dy -= 0.8 * ha * amp;
      }
      a.tilt -= 7 * lean * hold(c, 260, 600, 1800, 2900);
      a.sy -= 0.02 * bump(c, 4300, 5300);
      if (c > 4300) a.gaze = [0, 0];
      a.steady = c < 3600;
      break;
    }
    case "surprised": {
      // Startle, freeze, a double take left and right, a disbelieving double blink, then the jaw slowly closes.
      const startle = age < 900 ? (age < 120 ? smoothstep(age / 120) : 1 - smoothstep((age - 120) / 780)) : 0;
      a.scale += 0.12 * startle;
      a.dy -= 3 * bump(age, 0, 420);
      a.sy += 0.06 * bump(age, 0, 380);
      a.mouth += 0.3 * startle;
      a.steady = age < 1800;
      const g = age < 600 ? -1 : (age - 600) % 4200;
      const left = hold(g, 300, 380, 640, 720);
      const right = hold(g, 700, 780, 1090, 1170);
      a.gaze = g >= 300 && g < 700 ? [-0.85, -0.1] : g >= 700 && g < 1150 ? [0.85, -0.1] : [0, 0];
      a.tilt += -3 * left + 3 * right;
      a.blink = Math.max(bump(g, 1700, 1850), bump(g, 1950, 2100));
      const close = smoothstep(clamp01((age - 2600) / 900));
      a.mouth -= 0.45 * close;
      a.width *= 1 - 0.2 * close;
      break;
    }
    case "sad": {
      const c = age % 7000;
      a.sy -= 0.045 * bump(c, 0, 1400);
      a.dy += 0.5 * hold(c, 700, 1100, 1800, 2400);
      // Now and then a look up, as if for comfort, then back down.
      const up = hold(c, 3000, 3200, 3800, 4100);
      a.gaze = [0, 0.75 - 0.9 * up];
      a.openL = a.openR = 1 + 0.15 * up;
      a.dy -= 0.4 * up;
      const quiver = hold(c, 4400, 4600, 5300, 5600);
      a.skew += 0.12 * Math.sin(now / 40) * quiver;
      a.mouth += 0.05 * quiver;
      a.smile -= 0.15 * quiver;
      a.tilt += 1.5 * Math.sin(now / 2200);
      break;
    }
    case "thinking": {
      const c = age % 6400;
      a.gaze = c < 1200 ? PONDER[0] : c < 2400 ? PONDER[1] : PONDER[2];
      // "Hmm": the mouth slides to the other cheek and the head tips the other way.
      const hmm = hold(c, 1200, 1500, 2100, 2400);
      a.mouthX -= 1.8 * hmm;
      a.skew -= hmm;
      a.tilt -= 9 * hmm;
      // Then it clicks: eyes open on the viewer, a smile, a little hop.
      const idea = hold(c, 4100, 4250, 5600, 6200);
      if (idea > 0.3) a.gaze = [0, 0];
      a.openL *= 1 + 0.2 * idea;
      a.openR *= 1 + 0.4 * idea;
      a.scale += 0.08 * idea;
      a.smile += 0.8 * idea;
      a.mouthX -= 0.9 * idea;
      a.skew -= 0.5 * idea;
      a.width *= 1 + 0.5 * idea;
      a.mouth += 0.15 * idea;
      a.tilt -= 5 * idea;
      a.dy -= 1.6 * bump(c, 4100, 4500);
      a.tilt += 1.5 * Math.sin(now / 900);
      break;
    }
    case "sleepy": {
      // Dozes off, jolts awake, blinks it away, yawns, and starts drifting again.
      const c = age % 9200;
      const drift = c < 3000 ? smoothstep(c / 3000) : c < 3200 ? 1 - smoothstep((c - 3000) / 200) : 0;
      a.openL = a.openR = 1 - 0.8 * drift;
      a.dy += 1.6 * drift;
      a.tilt += 6 * drift;
      a.gaze = [0, 0.6 + 0.4 * drift];
      const jolt = bump(c, 3000, 3350);
      a.openL *= 1 + 0.9 * jolt;
      a.openR *= 1 + 0.9 * jolt;
      a.dy -= 1.4 * jolt;
      a.scale += 0.1 * jolt;
      if (c >= 3000 && c < 4200) a.gaze = [0, 0];
      a.blink = Math.max(bump(c, 3550, 3780), bump(c, 3900, 4130));
      a.yawn = hold(c, 5400, 6200, 6800, 7600);
      a.tilt += 2 * Math.sin(now / 1700);
      a.steady = c < 3000;
      break;
    }
    case "wink": {
      const c = age % 3200;
      let w = 0;
      if (c > 150 && c < 950) {
        const q = (c - 150) / 800;
        w = q < 0.2 ? smoothstep(q / 0.2) : q < 0.75 ? 1 : 1 - smoothstep((q - 0.75) / 0.25);
      }
      // The winking side's cheek and mouth corner lift; the other eye narrows a touch.
      a.laughR += w;
      a.laughL += 0.25 * w;
      a.openL *= 1 - 0.12 * w;
      a.skew += 0.45 * w;
      a.smile += 0.1 * w;
      a.tilt += 5 * w;
      a.dy -= 0.9 * bump(c, 150, 450);
      if (w > 0) a.gaze = [0, 0];
      a.steady = w > 0;
      break;
    }
  }
  return a;
}

/* ---------------------------------------------------------------- *
 * Motions
 * ---------------------------------------------------------------- */

interface Pose {
  dy: number;
  rot: number;
  sx: number;
  sy: number;
  /** Turn around the vertical axis, in degrees. The face travels around the body. */
  yaw: number;
  /** 0–1, how much the face lights up while moving. */
  joy: number;
  gaze: readonly [number, number] | null;
}

const MOTION_MS: Record<AiBotMotion, number> = {
  jump: 950,
  spin: 600,
  bounce: 1200,
  wiggle: 800,
  float: 2200,
};

const FLOAT = 4.5;

const REST: Pose = { dy: 0, rot: 0, sx: 1, sy: 1, yaw: 0, joy: 0, gaze: null };

function pose(motion: AiBotMotion, ms: number): Pose {
  const p = clamp01(ms / MOTION_MS[motion]);
  switch (motion) {
    case "jump": {
      if (ms < 160) {
        const q = smoothstep(ms / 160);
        return { ...REST, sx: 1 + 0.1 * q, sy: 1 - 0.14 * q, joy: q * 0.6 };
      }
      if (ms < 560) {
        const q = (ms - 160) / 400;
        const stretch = 0.09 * Math.abs(Math.cos(Math.PI * q));
        return { ...REST, dy: -11 * 4 * q * (1 - q), sx: 1 - stretch * 0.6, sy: 1 + stretch, joy: 1 };
      }
      const r = (ms - 560) / 390;
      const squash = 0.16 * Math.exp(-5 * r) * Math.cos(10 * r);
      return { ...REST, sx: 1 + squash * 0.7, sy: 1 - squash, joy: 1 - smoothstep(r) };
    }
    case "spin": {
      // Wind up the other way, turn a full circle on the spot with a small hop, settle.
      if (ms < 90) {
        const q = smoothstep(ms / 90);
        return { ...REST, yaw: -30 * q, sx: 1 + 0.06 * q, sy: 1 - 0.08 * q, joy: 0.3 * q, gaze: [-0.6 * q, 0] };
      }
      if (ms < 440) {
        const q = (ms - 90) / 350;
        const hop = Math.sin(Math.PI * q) ** 2;
        const crouch = 1 - smoothstep(Math.min(1, q * 4));
        return {
          ...REST,
          yaw: -30 + 390 * easeInOut(q),
          dy: -2.6 * hop,
          sx: 1 + 0.06 * crouch,
          sy: 1 - 0.08 * crouch + 0.04 * hop,
          joy: 0.8,
          gaze: [0.8 * hop, 0],
        };
      }
      const r = (ms - 440) / 160;
      const squash = 0.025 * Math.sin(Math.PI * r) * (1 - r);
      return { ...REST, yaw: 360, sx: 1 + squash * 0.7, sy: 1 - squash, joy: 0.8 * (1 - r) };
    }
    case "bounce": {
      const hop = Math.abs(Math.sin(Math.PI * 3 * p));
      const squash = 0.08 * (1 - hop) ** 6;
      return { ...REST, dy: -5 * hop, sx: 1 + squash * 0.8, sy: 1 - squash, joy: Math.sin(Math.PI * p) };
    }
    case "wiggle":
      return { ...REST, rot: 14 * Math.sin(Math.PI * 8 * p) * (1 - p), joy: 0.6 * Math.sin(Math.PI * p) };
    case "float": {
      // Lifts off, hovers marvelling at the ground below, drifts back down and lands softly.
      const down: readonly [number, number] = [0, 0.9];
      if (ms < 520) {
        const q = ms / 520;
        const s = 0.05 * Math.sin(Math.PI * q);
        return { ...REST, dy: -FLOAT * easeOut(q), sx: 1 - s * 0.6, sy: 1 + s, joy: 0.5 * q, gaze: q > 0.4 ? down : null };
      }
      if (ms < 1500) {
        const h = (ms - 520) / 980;
        return { ...REST, dy: -FLOAT + 0.8 * Math.sin(Math.PI * 3 * h), rot: 4 * Math.sin(Math.PI * 2 * h), joy: 0.5, gaze: down };
      }
      if (ms < 1820) {
        const q = (ms - 1500) / 320;
        return { ...REST, dy: -FLOAT * (1 - q * q), sx: 1 - 0.02 * q, sy: 1 + 0.04 * q, joy: 0.5, gaze: down };
      }
      const r = (ms - 1820) / 380;
      const squash = 0.12 * Math.exp(-5 * r) * Math.cos(10 * r) * (1 - r);
      return { ...REST, sx: 1 + squash * 0.7, sy: 1 - squash, joy: 0.5 * (1 - r) };
    }
  }
}

export const AI_BOT_SVG = {
  viewBox: "-24 -24 48 48",
  body: ROUND_BODY,
  eyes: EYES.map((x) => eyePath(x, EYE_Y, 1, 0, 1, 0, 0)),
  blush: EYES.map((x) => ({ cx: x * 1.6, cy: EYE_Y + 4.6 })),
  mouth: mouthPath(0, MOUTH_Y, 0, 0.4, 1, 0),
  groundY: GROUND_Y,
  heart: HEART,
  hearts: HEARTS,
} as const;

/* ---------------------------------------------------------------- *
 * Engine: drives the SVG directly, once per frame, outside any framework render
 * ---------------------------------------------------------------- */

export interface AiBotElements {
  svg: SVGSVGElement;
  mover: SVGGElement;
  bodyGroup: SVGGElement;
  body: SVGPathElement;
  face: SVGGElement;
  eyes: readonly (SVGPathElement | null)[];
  mouth: SVGPathElement;
  ground: SVGEllipseElement;
  core: SVGEllipseElement;
  blush: readonly (SVGEllipseElement | null)[];
  hearts: readonly (SVGPathElement | null)[];
}

export interface AiBotOptions {
  emotion?: AiBotEmotion;
  activity?: AiBotActivity;
  shape?: AiBotShape;
  /** Plays once; change `motionKey` to replay the same motion. */
  motion?: AiBotMotion | null;
  motionKey?: number;
  onMotionEnd?: (motion: AiBotMotion) => void;
  /** Idle glances around the room. */
  lookAround?: boolean;
  /** Eyes follow the mouse pointer anywhere in the window. */
  followCursor?: boolean;
  /** Giggles when the pointer touches the body. */
  hoverGiggle?: boolean;
  /** Fires when the pointer starts a giggle. */
  onTickle?: () => void;
  /** Change to make the bot chuckle along softly, as if someone next to it were being tickled. */
  chuckleKey?: number;
}

export interface AiBot {
  update(options: AiBotOptions): void;
  destroy(): void;
}

interface Config {
  emotion: AiBotEmotion;
  activity: AiBotActivity;
  shape: AiBotShape;
  lookAround: boolean;
  followCursor: boolean;
  hoverGiggle: boolean;
}

const resolve = (o: AiBotOptions): Config => ({
  emotion: o.emotion ?? "neutral",
  activity: o.activity ?? "idle",
  shape: o.shape ?? "pebble",
  lookAround: o.lookAround ?? true,
  followCursor: o.followCursor ?? false,
  hoverGiggle: o.hoverGiggle ?? true,
});

export function createAiBot(els: AiBotElements, options: AiBotOptions = {}): AiBot {
  const state: {
    config: Config;
    playing: { name: AiBotMotion; start: number } | null;
    morph: { from: Float32Array; start: number } | null;
    onMotionEnd?: (motion: AiBotMotion) => void;
    onTickle?: () => void;
    tickledAt: number;
    chuckledAt: number;
  } = {
    config: resolve(options),
    playing: options.motion ? { name: options.motion, start: performance.now() } : null,
    morph: null,
    onMotionEnd: options.onMotionEnd,
    onTickle: options.onTickle,
    tickledAt: -Infinity,
    chuckledAt: -Infinity,
  };
  const radii = new Float32Array(POINTS).fill(1);
  let shown = state.config.shape;
  let motionNow = options.motion ?? null;
  let motionKeyNow = options.motionKey ?? 0;
  let heard = options.chuckleKey ?? 0;

  const onEnter = () => {
    const now = performance.now();
    if (state.config.hoverGiggle && now - state.tickledAt > 1300) {
      state.tickledAt = now;
      state.onTickle?.();
    }
  };
  els.mover.addEventListener("pointerenter", onEnter);

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

  const cur: Expression = { ...EXPRESSIONS[state.config.emotion] };
  // Each instance starts somewhere else in its wobble, turn and breath, so neighbours never move in lockstep.
  const phase = Math.random() * 1000;
  let raf = 0;
  let last = performance.now();
  let gx = 0;
  let gy = 0;
  let tx = 0;
  let ty = 0;
  let nextGaze = last + 600 + Math.random() * 1800;
  let blinkAt = last + 800 + Math.random() * 2600;
  let blinkStart = -1;
  let second = false;
  let grinAt = -Infinity;
  let mgx = 0;
  let mgy = 0;
  let nextGrin = last + 4000 + Math.random() * 4000;
  let spin = Math.random() * 360;
  let seat = R0;
  let footX = 0;
  let footW = 7;
  let level = 0;
  let jaw = 0;
  let syllable = 0;
  let syllableRate = 5.5;
  let syllableAmp = 1;
  let vowel = 1;
  // Scripted speech: words of a few syllables, short gaps, and a longer breath every few words.
  let wordEnds = 0;
  let gapEnds = 0;
  let wordsLeft = 6;
  let pausing = false;
  let stressAt = -Infinity;
  let nextNod = last + 900;
  let nodStart = -Infinity;
  let nods = 0;
  // Null until the first frame, so the starting emotion gets a finite age like any later change.
  let felt: AiBotEmotion | null = null;
  let feltAt = last;
  let lovedFrom = -Infinity;
  let lovedUntil = -Infinity;

  const frame = (now: number) => {
    const dt = Math.min(0.064, (now - last) / 1000);
    last = now;
    const t = reduce ? 0 : now / 1000 + phase;
    const cfg = state.config;
    if (cfg.emotion !== felt) {
      if (felt === "love") lovedUntil = now;
      felt = cfg.emotion;
      feltAt = now;
      if (felt === "love") {
        lovedFrom = now;
        lovedUntil = Infinity;
      }
    }
    const age = now - feltAt;
    const target = EXPRESSIONS[felt];
    const k = Math.min(1, dt * (SETTLE[felt] ?? 8));
    for (const key of KEYS) {
      const goal = target[key];
      if (Number.isNaN(goal)) cur[key] = Number.NaN;
      else if (Number.isNaN(cur[key])) cur[key] = goal;
      else cur[key] += (goal - cur[key]) * k;
    }
    const a = reduce ? still() : act(felt, age, now);

    // Activity drives the signal level and, while speaking, the jaw.
    let levelTarget = 0;
    let talkTarget = 0;
    if (cfg.activity === "speaking") {
      if (now > gapEnds && now > wordEnds) {
        wordEnds = now + 160 + Math.random() * 260;
        wordsLeft -= 1;
        pausing = wordsLeft <= 0;
        gapEnds = wordEnds + (pausing ? 520 + Math.random() * 420 : 60 + Math.random() * 120);
        if (pausing) wordsLeft = 4 + Math.floor(Math.random() * 5);
        if (Math.random() < 0.3) stressAt = now;
      }
      const inWord = now < wordEnds;
      levelTarget = inWord ? 0.55 + 0.35 * Math.abs(Math.sin(now / 70)) : 0;
      if (inWord) {
        syllable += dt * syllableRate * Math.PI * 2;
        if (syllable >= Math.PI * 2) {
          syllable -= Math.PI * 2;
          syllableRate = 4.6 + Math.random() * 2;
          syllableAmp = Math.random() < 0.18 ? 0.12 : 0.55 + Math.random() * 0.45;
          // Wide vowels stretch the mouth, round ones (o, u) purse it.
          vowel = Math.random() < 0.4 ? 0.62 + Math.random() * 0.12 : 1 + Math.random() * 0.2;
        }
        talkTarget = Math.min(1, (0.35 + level) * syllableAmp * (0.5 - 0.5 * Math.cos(syllable)));
      } else {
        syllable = 0;
      }
      // Stressed words get a small head bob and brighter eyes.
      const stress = bump(now - stressAt, 0, 280);
      a.dy -= 0.7 * stress;
      a.scale += 0.06 * stress;
    } else if (cfg.activity === "listening") {
      levelTarget = 0.18 + 0.14 * Math.sin(now / 240) * Math.sin(now / 610);
    }
    level += (levelTarget - level) * Math.min(1, dt * 12);
    jaw += (talkTarget - jaw) * Math.min(1, dt * (talkTarget > jaw ? 30 : 20));

    let move = REST;
    const play = state.playing;
    if (play && !reduce) {
      const ms = now - play.start;
      if (ms >= MOTION_MS[play.name]) {
        state.playing = null;
        state.onMotionEnd?.(play.name);
      } else {
        move = pose(play.name, ms);
      }
    }

    // Listeners nod along: a double "mhm" nod, and every third time an interested "oh?" instead.
    const listening = cfg.activity === "listening" ? 1 : 0;
    if (listening && !play && now > nextNod) {
      nodStart = now;
      nods += 1;
      nextNod = now + 2400 + Math.random() * 1800;
    }
    if (listening && !reduce) {
      const n = now - nodStart;
      if (nods % 3 === 0) {
        const oh = hold(n, 0, 160, 700, 1000);
        a.scale += 0.08 * oh;
        a.faceY -= 0.6 * oh;
        a.mouth += 0.18 * oh;
        a.smile -= 0.3 * oh;
        a.dy -= 0.5 * oh;
      } else {
        const dip = bump(n, 0, 300) + 0.7 * bump(n, 340, 640);
        a.dy += 1.6 * dip;
        a.faceY += 1.2 * dip;
        a.sy -= 0.02 * dip;
        a.openL *= 1 - 0.15 * dip;
        a.openR *= 1 - 0.15 * dip;
        a.smile += 0.1 * dip;
      }
      a.tilt += 4 + 1.5 * Math.sin(now / 2600);
    }

    // Gaze: the cursor wins, then a motion or act, then an expression's resting point, then the idle script.
    let watching = false;
    const box = cfg.followCursor && pointer ? els.svg.getBoundingClientRect() : undefined;
    if (pointer && box && box.width > 0) {
      const dx = pointer.x - (box.left + box.width / 2);
      const dy = pointer.y - (box.top + box.height / 2);
      // Soft falloff: the pupils travel fast near the face and ease toward the rim far away.
      const reach = box.width * 0.9;
      watching = true;
      tx = dx / (Math.abs(dx) + reach);
      ty = dy / (Math.abs(dy) + reach);
      nextGaze = now + 700;
    }
    const scripted = move.gaze ?? a.gaze;
    if (!watching) {
      if (scripted) {
        tx = scripted[0];
        ty = scripted[1];
      } else if (!Number.isNaN(cur.gazeX)) {
        tx = cur.gazeX;
        ty = cur.gazeY;
      } else if (now > nextGaze) {
        if (cfg.activity === "listening") {
          tx = (Math.random() - 0.5) * 0.3;
          ty = -0.05 + (Math.random() - 0.5) * 0.15;
        } else if (cfg.activity === "speaking") {
          // Speakers look away while they gather the next sentence, and back for the words.
          tx = pausing ? (Math.random() < 0.5 ? -0.7 : 0.7) : (Math.random() - 0.5) * 0.5;
          ty = pausing ? -0.5 : (Math.random() - 0.5) * 0.3;
        } else if (cfg.lookAround) {
          tx = [-1, -0.6, 0, 0, 0.6, 1][Math.floor(Math.random() * 6)];
          ty = (Math.random() - 0.5) * 1.2;
        } else {
          tx = 0;
          ty = 0;
        }
        nextGaze = now + (cfg.activity === "speaking" ? 500 + Math.random() * 900 : 900 + Math.random() * 2300);
      }
    }
    // Eyes jump between points (saccades) rather than drifting.
    const ease = Math.min(1, dt * (watching ? 14 : 16));
    gx += (tx - gx) * ease;
    gy += (ty - gy) * ease;
    // The mouth rides on the face, which turns after the eyes and more softly.
    const lag = Math.min(1, dt * 5);
    mgx += (gx - mgx) * lag;
    mgy += (gy - mgy) * lag;

    // Blinks, with the odd double blink. Tired and sad eyes close slowly.
    if (a.steady && blinkStart < 0) blinkAt = Math.max(blinkAt, now + 400);
    if (blinkStart < 0 && now > blinkAt) blinkStart = now;
    let blink = 1;
    if (blinkStart >= 0) {
      const p = (now - blinkStart) / (felt === "sleepy" ? 460 : felt === "sad" ? 280 : 170);
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
        blink = 1 - Math.sin(p * Math.PI) * 0.88;
      }
    }
    blink *= 1 - a.blink * 0.9;

    // A short giggle per hover.
    const since = now - state.tickledAt;
    let tickle = 0;
    let wiggle = 0;
    if (cfg.hoverGiggle && since < 1300) {
      tickle = since < 180 ? smoothstep(since / 180) : since < 800 ? 1 : 1 - smoothstep((since - 800) / 500);
      wiggle = Math.sin(since / 42) * Math.max(0, 1 - since / 520);
    }
    // Chuckling along is a softer, longer, wiggle-free version of the giggle.
    const heardFor = now - state.chuckledAt;
    const amused = heardFor > 0 && heardFor < 1700 ? 0.45 * hold(heardFor, 0, 260, 1000, 1700) : 0;
    tickle = Math.max(tickle, amused);

    // The occasional grin, only when nothing else is going on.
    if (felt === "neutral" && cfg.activity === "idle" && now > nextGrin) {
      grinAt = now;
      nextGrin = now + 5000 + Math.random() * 6000;
    }
    const grinning = felt === "neutral" ? hold(now - grinAt, 0, 380, 1100, 1600) : 0;

    const sleepy = felt === "sleepy" ? 1 : 0;
    const yawn = a.yawn;
    const shapeNow = cfg.shape;

    // Body.
    const wob = cur.wobble + level * 0.6 + tickle * 0.25;
    const snap = shapeNow === "squircle" ? 90 : shapeNow === "blob" ? 120 : shapeNow === "pebble" ? 72 : 0;
    const rate = snap ? 0 : 3.5 + level * 18;
    spin = reduce ? spin : (spin + dt * rate * cur.spin) % 360;
    if (snap) spin += (Math.round(spin / snap) * snap - spin) * Math.min(1, dt * 4);
    const m = state.morph;
    const mix = m ? smoothstep(clamp01((now - m.start) / MORPH_MS)) : 1;
    // The outline turns, not the fill, so the highlight stays top-left.
    const turn = (spin * Math.PI) / 180;
    const r = radii;
    for (let i = 0; i < POINTS; i++) {
      const live = radius(shapeNow, (i / POINTS) * Math.PI * 2 - turn, t, wob);
      r[i] = m && mix < 1 ? m.from[i] + (live - m.from[i]) * mix : live;
    }
    if (m && mix >= 1) state.morph = null;
    const breathe = reduce ? 0 : sleepy ? 0.03 * Math.sin(t / 1.1) : 0.015 * Math.sin(t / 0.9);
    const swell = 1 + breathe + level * 0.04;
    els.body.setAttribute("d", bodyPath(r));
    els.bodyGroup.setAttribute("transform", `scale(${swell.toFixed(4)})`);

    const yaw = (move.yaw * Math.PI) / 180;
    const bob = cur.bob + sleepy * 0.4 * Math.sin(now / 1100) - tickle * 0.5 + jaw * 0.25 - yawn * 0.5;
    const rot = cur.tilt + a.tilt + wiggle * 4 + move.rot;
    const dy = move.dy + bob + a.dy;
    // The floor is solid: rising lifts the body, sinking slumps it (flatter and a little wider) instead.
    const rise = Math.min(0, dy);
    const slump = (0.7 * Math.max(0, dy)) / (2 * R0);
    const sy = move.sy * (1 + a.sy + yawn * 0.03) * (1 - slump);
    const sx = move.sx * (1 - (a.sy + yawn * 0.03) * 0.5) * (1 - 0.04 * Math.abs(Math.sin(yaw))) * (1 + slump * 0.5);

    // Find where the tilted outline actually touches down, and how wide that patch is.
    const tilt = (rot * Math.PI) / 180;
    let low = 0;
    for (let i = 0; i < POINTS; i++) low = Math.max(low, r[i] * Math.sin((i / POINTS) * Math.PI * 2 + tilt));
    low *= R0 * swell;
    let left = Infinity;
    let right = -Infinity;
    for (let i = 0; i < POINTS; i++) {
      const th = (i / POINTS) * Math.PI * 2 + tilt;
      const k = r[i] * R0 * swell;
      if (k * Math.sin(th) < low - 2.2) continue;
      left = Math.min(left, k * Math.cos(th));
      right = Math.max(right, k * Math.cos(th));
    }
    seat += (low - seat) * Math.min(1, dt * 12);
    els.mover.setAttribute(
      "transform",
      `translate(0 ${rise.toFixed(2)}) translate(0 ${R0}) scale(${sx.toFixed(4)} ${sy.toFixed(4)}) translate(0 ${(-seat).toFixed(2)}) rotate(${rot.toFixed(2)})`,
    );
    // A contact shadow: a dense core under the patch that touches, inside a soft penumbra. Lifting off
    // dissolves the core first while the penumbra spreads and pales; a wider footprint widens both.
    const height = clamp01(-rise / 10);
    const foot = ((right - left) / 2) * sx;
    const under = ((left + right) / 2) * sx;
    footX += (under - footX) * Math.min(1, dt * 12);
    footW += (foot - footW) * Math.min(1, dt * 12);
    const ground = els.ground;
    if (ground) {
      ground.setAttribute("cx", (footX * (1 - height)).toFixed(2));
      ground.setAttribute("rx", ((footW + 3.2) * (1 + 0.25 * height)).toFixed(2));
      ground.setAttribute("ry", (2 * (1 + 0.2 * height)).toFixed(2));
      ground.setAttribute("opacity", ((1 - 0.65 * height) * (0.9 + 2 * slump)).toFixed(3));
    }
    const core = els.core;
    if (core) {
      core.setAttribute("cx", footX.toFixed(2));
      core.setAttribute("rx", (footW * 0.95 * (1 - 0.4 * height)).toFixed(2));
      core.setAttribute("ry", (0.85 * (1 - 0.3 * height)).toFixed(2));
      core.setAttribute("opacity", ((1 - height) ** 2 * (0.9 + 3 * slump)).toFixed(3));
    }

    // The face sits on the front of a sphere: turning slides it across and foreshortens it, then hides it behind.
    const face = els.face;
    if (face) {
      const front = Math.cos(yaw);
      face.setAttribute(
        "transform",
        `translate(${(Math.sin(yaw) * R0 * 0.72).toFixed(2)} 0) scale(${Math.max(0.001, Math.abs(front)).toFixed(3)} 1)`,
      );
      face.setAttribute("opacity", smoothstep(clamp01((front + 0.1) / 0.35)).toFixed(3));
    }

    // Hearts drift up past the cheeks, alternating sides; leaving love fades them out fast so they never carry over.
    const gone = 1 - smoothstep(clamp01((now - lovedUntil) / 200));
    els.hearts.forEach((heart, i) => {
      if (!heart) return;
      const since = now - lovedFrom - 250 - i * (HEART_EVERY / HEARTS);
      const n = Math.floor(since / HEART_EVERY);
      const p = (since - n * HEART_EVERY) / HEART_LIFE;
      const born = lovedFrom + 250 + i * (HEART_EVERY / HEARTS) + n * HEART_EVERY;
      if (reduce || !(since >= 0 && since < Infinity) || p >= 1 || born > lovedUntil || gone <= 0) {
        heart.setAttribute("opacity", "0");
        return;
      }
      const side = (i + n) % 2 ? 1 : -1;
      const seed = hash(n * HEARTS + i);
      const x = side * (12 + 1.5 * seed + 2 * p) + 0.9 * Math.sin(Math.PI * 2 * (1.1 * p + seed));
      const y = rise - 4 - seed * 2 - 14 * easeOut(p);
      const grow = (0.75 + 0.35 * seed) * (0.5 + 0.5 * smoothstep(clamp01(p / 0.18)));
      const sway = side * 10 + 14 * Math.sin(Math.PI * 2 * (0.9 * p + seed));
      heart.setAttribute(
        "transform",
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${sway.toFixed(1)}) scale(${grow.toFixed(3)})`,
      );
      heart.setAttribute(
        "opacity",
        (gone * smoothstep(clamp01(p / 0.12)) * (1 - smoothstep(clamp01((p - 0.55) / 0.45)))).toFixed(3),
      );
    });

    // Face.
    const joy = Math.max(move.joy, grinning);
    const look = 1 - tickle;
    const base = Math.min(1, cur.smile + a.smile + (1 - cur.smile) * joy + listening * 0.15);
    const smile = Math.max(-1, (base + (1 - base) * tickle) * (1 - yawn));
    const squint = 1 - 0.18 * Math.max(0, (smile - 0.6) / 0.4);
    const opens = [cur.openL * a.openL, cur.openR * a.openR];
    const laughs = [cur.laughL + a.laughL, cur.laughR + a.laughR];
    els.eyes.forEach((eye, i) => {
      if (!eye) return;
      const x = EYES[i] + gx * 1.8 * look;
      const y = EYE_Y + cur.eyeY + a.faceY + gy * 1.1 * look;
      const curl = clamp01(Math.max(laughs[i], tickle, move.joy * 0.8));
      const outer = Math.min(0.9, cur.heavy + cur.droop);
      const inner = Math.min(0.9, cur.heavy);
      const open = opens[i] * blink * squint * (1 - yawn * 0.85);
      eye.setAttribute(
        "d",
        eyePath(x, y, open, curl, cur.eyeScale + a.scale + listening * 0.04, i === 0 ? outer : inner, i === 0 ? inner : outer),
      );
      eye.setAttribute("stroke-width", (curl * 0.7).toFixed(2));
      const cheek = els.blush[i];
      if (cheek) {
        cheek.setAttribute("cx", (EYES[i] * 1.6 + gx * 1.2 * look).toFixed(2));
        cheek.setAttribute("cy", (EYE_Y + 4.6 + a.faceY + gy * 0.7 * look).toFixed(2));
        cheek.setAttribute("opacity", clamp01(cur.blush).toFixed(3));
      }
    });
    const giggle = tickle * (0.3 + 0.25 * Math.abs(Math.sin(now / 85)));
    const mouthW = cur.mouthW * a.width * (1 + (vowel - 1) * jaw) * (1 - yawn * 0.1);
    const lip = clamp01(-smile + cur.taper * (1 - yawn));
    const mouth = els.mouth;
    if (mouth) {
      mouth.setAttribute(
        "d",
        mouthPath(
          (cur.mouthX + a.mouthX) * (1 - yawn) + mgx * 1.2 * look,
          MOUTH_Y + cur.eyeY * 0.5 + a.faceY + mgy * 0.6 * look,
          Math.max(0, cur.mouth + a.mouth, jaw, giggle, move.joy * 0.35, yawn * 2.1),
          smile,
          mouthW,
          (cur.skew + a.skew) * (1 - yawn),
          0.9 * lip,
        ),
      );
      // Short mouths get a finer line so they stay a line, not a dot.
      const fine = Math.min(1, 0.55 + 0.45 * mouthW);
      mouth.setAttribute("stroke-width", (1.4 * fine * (1 - 0.6 * lip)).toFixed(2));
    }

    raf = requestAnimationFrame(frame);
  };

  raf = requestAnimationFrame(frame);
  const stop = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("pointermove", onMove);
    document.documentElement.removeEventListener("pointerleave", onLeave);
  };

  return {
    update(next) {
      state.config = resolve(next);
      state.onMotionEnd = next.onMotionEnd;
      state.onTickle = next.onTickle;
      if (state.config.shape !== shown) {
        shown = state.config.shape;
        state.morph = { from: radii.slice(), start: performance.now() };
      }
      const motion = next.motion ?? null;
      const key = next.motionKey ?? 0;
      if (motion !== motionNow || key !== motionKeyNow) {
        motionNow = motion;
        motionKeyNow = key;
        state.playing = motion ? { name: motion, start: performance.now() } : null;
      }
      const chuckle = next.chuckleKey ?? 0;
      if (chuckle !== heard) {
        heard = chuckle;
        // A beat of reaction time before it catches on.
        state.chuckledAt = performance.now() + 140 + Math.random() * 160;
      }
    },
    destroy() {
      stop();
      els.mover.removeEventListener("pointerenter", onEnter);
    },
  };
}
