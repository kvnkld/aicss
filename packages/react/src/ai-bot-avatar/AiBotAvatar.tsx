"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import { AI_BOT_SVG, createAiBot, type AiBot, type AiBotOptions } from "./engine";
import s from "./AiBotAvatar.module.css";

export {
  AI_BOT_EMOTIONS,
  AI_BOT_MOTIONS,
  AI_BOT_SHAPES,
  type AiBotActivity,
  type AiBotEmotion,
  type AiBotMotion,
  type AiBotShape,
} from "./engine";

export interface AiBotAvatarProps extends AiBotOptions {
  /** Gradient stops, light to dark. Defaults to the theme blue. */
  colors?: readonly [string, string];
  /** Diameter of the body in px. Motions spill outside this box. */
  size?: number;
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function AiBotAvatar({ colors, size = 120, label = "AI assistant", className, style, ...options }: AiBotAvatarProps) {
  const gradId = `bot-${useId().replace(/:/g, "")}`;
  const svgRef = useRef<SVGSVGElement>(null);
  const moverRef = useRef<SVGGElement>(null);
  const bodyGroupRef = useRef<SVGGElement>(null);
  const bodyRef = useRef<SVGPathElement>(null);
  const faceRef = useRef<SVGGElement>(null);
  const mouthRef = useRef<SVGPathElement>(null);
  const groundRef = useRef<SVGEllipseElement>(null);
  const coreRef = useRef<SVGEllipseElement>(null);
  const eyes = useRef<(SVGPathElement | null)[]>([]);
  const blush = useRef<(SVGEllipseElement | null)[]>([]);
  const hearts = useRef<(SVGPathElement | null)[]>([]);
  const bot = useRef<AiBot | null>(null);
  const latest = useRef(options);

  useEffect(() => {
    latest.current = options;
    bot.current?.update(options);
  });

  useEffect(() => {
    const svg = svgRef.current;
    const mover = moverRef.current;
    const bodyGroup = bodyGroupRef.current;
    const body = bodyRef.current;
    const face = faceRef.current;
    const mouth = mouthRef.current;
    const ground = groundRef.current;
    const core = coreRef.current;
    if (!svg || !mover || !bodyGroup || !body || !face || !mouth || !ground || !core) return;
    bot.current = createAiBot(
      { svg, mover, bodyGroup, body, face, mouth, ground, core, eyes: eyes.current, blush: blush.current, hearts: hearts.current },
      latest.current,
    );
    return () => {
      bot.current?.destroy();
      bot.current = null;
    };
  }, []);

  const vars = {
    "--bot-size": `${size}px`,
    ...(colors ? { "--bot-1": colors[0], "--bot-2": colors[1] } : null),
    ...style,
  } as CSSProperties;

  return (
    <span className={`${s.root}${className ? ` ${className}` : ""}`} style={vars} role="img" aria-label={label}>
      <svg ref={svgRef} className={s.svg} viewBox={AI_BOT_SVG.viewBox} aria-hidden>
        <defs>
          <radialGradient id={gradId} gradientUnits="userSpaceOnUse" cx="-4.8" cy="-6.4" r="24">
            <stop className={s.stop1} offset="0" />
            <stop className={s.stop2} offset="1" />
          </radialGradient>
          <filter id={`${gradId}-soft`} x="-50%" y="-300%" width="200%" height="700%">
            <feGaussianBlur stdDeviation="1.3" />
          </filter>
          <filter id={`${gradId}-core`} x="-50%" y="-300%" width="200%" height="700%">
            <feGaussianBlur stdDeviation="0.8" />
          </filter>
          <filter id={`${gradId}-blush`} x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="0.55" />
          </filter>
        </defs>
        <ellipse
          ref={groundRef}
          className={s.ground}
          cx="0"
          cy={AI_BOT_SVG.groundY}
          rx="10"
          ry="2.1"
          filter={`url(#${gradId}-soft)`}
        />
        <ellipse
          ref={coreRef}
          className={s.core}
          cx="0"
          cy={AI_BOT_SVG.groundY}
          rx="6.5"
          ry="0.9"
          filter={`url(#${gradId}-core)`}
        />
        <g ref={moverRef}>
          <g ref={bodyGroupRef}>
            <path ref={bodyRef} d={AI_BOT_SVG.body} fill={`url(#${gradId})`} />
          </g>
          <g ref={faceRef}>
            {AI_BOT_SVG.blush.map((b, i) => (
              <ellipse
                key={`blush${i}`}
                ref={(node) => {
                  blush.current[i] = node;
                }}
                className={s.blush}
                cx={b.cx}
                cy={b.cy}
                rx="1.9"
                ry="1.1"
                opacity="0"
                filter={`url(#${gradId}-blush)`}
              />
            ))}
            {AI_BOT_SVG.eyes.map((d, i) => (
              <path
                key={`eye${i}`}
                ref={(node) => {
                  eyes.current[i] = node;
                }}
                className={s.face}
                d={d}
                strokeWidth={0}
                strokeLinejoin="round"
              />
            ))}
            <path
              ref={mouthRef}
              className={s.face}
              d={AI_BOT_SVG.mouth}
              strokeWidth={1.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </g>
        </g>
        {Array.from({ length: AI_BOT_SVG.hearts }, (_, i) => (
          <path
            key={i}
            ref={(node) => {
              hearts.current[i] = node;
            }}
            className={s.heart}
            d={AI_BOT_SVG.heart}
            opacity="0"
          />
        ))}
      </svg>
    </span>
  );
}
