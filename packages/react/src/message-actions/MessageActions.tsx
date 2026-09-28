"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { EMOJI_GROUPS } from "./emojis";
import { messageActionIcons, type MessageActionIcons } from "./icons";
import styles from "./MessageActions.module.css";

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

type CueApi = {
  aim: (anchor: HTMLElement, label: string) => void;
  hide: () => void;
};

const CueContext = createContext<CueApi | null>(null);

function Cue({
  label,
  children,
  quiet = false,
}: {
  label: string;
  children: ReactNode;
  quiet?: boolean;
}) {
  const cue = useContext(CueContext);
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !cue) return;
    const hot = node.matches(":hover") || node.contains(document.activeElement);
    if (!hot) return;
    if (quiet) cue.hide();
    else cue.aim(node, label);
  }, [cue, label, quiet]);

  return (
    <span
      ref={ref}
      className={styles.hit}
      onMouseEnter={(event) => {
        if (quiet) return;
        cue?.aim(event.currentTarget, label);
      }}
      onFocus={(event) => {
        if (quiet) return;
        cue?.aim(event.currentTarget, label);
      }}
    >
      {children}
    </span>
  );
}

function RowCues({ children }: { children: ReactNode }) {
  const tipId = useId();
  const bubbleRef = useRef<HTMLDivElement>(null);
  const gaugeRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<HTMLElement | null>(null);
  const labelRef = useRef("");
  const openRef = useRef(false);
  const describedRef = useRef<HTMLElement | null>(null);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [tipTheme, setTipTheme] = useState<"light" | "dark">("light");

  useEffect(() => setMounted(true), []);

  const write = (bubble: HTMLDivElement, x: number, y: number, width: number) => {
    bubble.style.setProperty("--cue-x", `${x}px`);
    bubble.style.setProperty("--cue-y", `${y}px`);
    bubble.style.setProperty("--cue-w", `${width}px`);
  };

  const measure = (anchor: HTMLElement, next: string) => {
    const bubble = bubbleRef.current;
    const gauge = gaugeRef.current;
    if (!bubble || !gauge) return null;
    gauge.textContent = next;
    const host = (anchor.querySelector("button, time") as HTMLElement | null) ?? anchor;
    const rect = host.getBoundingClientRect();
    const width = Math.ceil(gauge.offsetWidth + 10);
    const height = Math.ceil(gauge.offsetHeight + 8);
    return {
      host,
      x: Math.round(rect.left + rect.width / 2 - width / 2),
      y: Math.round(rect.top - height - 6),
      width,
    };
  };

  const place = useCallback((anchor: HTMLElement, next: string, reveal: boolean) => {
    const bubble = bubbleRef.current;
    const spot = measure(anchor, next);
    if (!bubble || !spot) return;
    const arriving = reveal && !openRef.current;
    if (arriving) {
      bubble.dataset.hold = "true";
      write(bubble, spot.x, spot.y, spot.width);
      void bubble.offsetWidth;
      delete bubble.dataset.hold;
      openRef.current = true;
      setOpen(true);
    } else if (openRef.current) {
      write(bubble, spot.x, spot.y, spot.width);
    }
    if (describedRef.current && describedRef.current !== spot.host) {
      describedRef.current.removeAttribute("aria-describedby");
    }
    spot.host.setAttribute("aria-describedby", tipId);
    describedRef.current = spot.host;
    const from = anchor.closest("[data-theme]")?.getAttribute("data-theme");
    setTipTheme(from === "dark" ? "dark" : "light");
    setLabel((current) => (current === next ? current : next));
  }, [tipId]);

  const aim = useCallback((anchor: HTMLElement, next: string) => {
    anchorRef.current = anchor;
    labelRef.current = next;
    place(anchor, next, true);
  }, [place]);

  const hide = useCallback(() => {
    openRef.current = false;
    anchorRef.current = null;
    describedRef.current?.removeAttribute("aria-describedby");
    describedRef.current = null;
    setOpen(false);
  }, []);

  useIsoLayoutEffect(() => {
    if (!open) return;
    const follow = () => {
      const anchor = anchorRef.current;
      const bubble = bubbleRef.current;
      if (!anchor || !bubble || !openRef.current) return;
      const spot = measure(anchor, labelRef.current);
      if (!spot) return;
      bubble.dataset.hold = "true";
      write(bubble, spot.x, spot.y, spot.width);
      void bubble.offsetWidth;
      delete bubble.dataset.hold;
    };
    window.addEventListener("scroll", follow, true);
    window.addEventListener("resize", follow);
    return () => {
      window.removeEventListener("scroll", follow, true);
      window.removeEventListener("resize", follow);
    };
  }, [open]);

  const api = useMemo<CueApi>(() => ({ aim, hide }), [aim, hide]);

  return (
    <CueContext.Provider value={api}>
      {children}
      {mounted
        ? createPortal(
            <>
              <span ref={gaugeRef} className={styles.tipGauge} aria-hidden="true" />
              <div
                ref={bubbleRef}
                id={tipId}
                role="tooltip"
                data-theme={tipTheme}
                data-up={open ? "true" : undefined}
                className={styles.tip}
                aria-hidden={open ? undefined : true}
              >
                {label}
              </div>
            </>,
            document.body,
          )
        : null}
    </CueContext.Provider>
  );
}

function CueRoot({
  rootRef,
  children,
}: {
  rootRef: RefObject<HTMLDivElement | null>;
  children: ReactNode;
}) {
  const cue = useContext(CueContext);
  return (
    <div
      ref={rootRef}
      className={styles.root}
      onMouseLeave={() => cue?.hide()}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        cue?.hide();
      }}
    >
      {children}
    </div>
  );
}

const REACTIONS = ["👍", "❤️", "😄", "🎉", "🤔", "👀"] as const;

type Vote = "up" | "down" | null;

const ROLL_MS = 400;

function elapsedMinutes(date: Date, now: number) {
  return Math.max(0, Math.round((now - date.getTime()) / 60000));
}

function formatAgo(date: Date, now = Date.now()) {
  const minutes = elapsedMinutes(date, now);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function MinuteRoll({ value }: { value: string }) {
  const prevRef = useRef(value);
  const [oldVal, setOldVal] = useState(value);
  const [newVal, setNewVal] = useState(value);
  const [rolling, setRolling] = useState(false);
  const [shifted, setShifted] = useState(false);
  const [dir, setDir] = useState<"up" | "down">("up");

  useEffect(() => {
    if (prevRef.current === value) return;
    const from = prevRef.current;
    prevRef.current = value;
    const fromN = parseInt(from, 10);
    const toN = parseInt(value, 10);
    setDir(Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN ? "down" : "up");
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = window.setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.clearTimeout(done);
    };
  }, [value]);

  const chars = rolling ? newVal : oldVal;

  return (
    <span className={styles.minRolls}>
      {Array.from({ length: chars.length }, (_, i) => {
        const previous = oldVal[i] ?? "";
        const next = chars[i] ?? "";
        if (!rolling || previous === next) {
          return (
            <span key={`${i}-${next}`} className={styles.minStatic}>
              {next}
            </span>
          );
        }
        const top = dir === "down" ? next : previous;
        const bottom = dir === "down" ? previous : next;
        return (
          <span key={`${i}-${previous}-${next}-${dir}`} className={styles.minRoll}>
            <span
              className={styles.minRollInner}
              data-dir={dir}
              data-shifted={shifted ? "true" : undefined}
            >
              <span>{top}</span>
              <span>{bottom}</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}

function formatAbsolute(date: Date) {
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function MessageActions({
  text = "Thanks, that answered it.",
  sentAt,
  onCopy,
  onVote,
  onReact,
  onReply,
  onFork,
  icons,
}: {
  text?: string;
  sentAt?: Date;
  onCopy?: (text: string) => void;
  onVote?: (vote: Vote) => void;
  onReact?: (emoji: string | null) => void;
  onReply?: () => void;
  onFork?: () => void;
  icons?: Partial<MessageActionIcons>;
}) {
  const [vote, setVote] = useState<Vote>(null);
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<"react" | "more" | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [reaction, setReaction] = useState<string | null>(null);
  const [extra, setExtra] = useState<string | null>(null);
  const [extraOut, setExtraOut] = useState(false);
  const [upN, setUpN] = useState(0);
  const [downN, setDownN] = useState(0);
  const [smileN, setSmileN] = useState(0);
  const [replyN, setReplyN] = useState(0);
  const icon = { ...messageActionIcons, ...icons };
  const Good = icon.good;
  const Bad = icon.bad;
  const Copy = icon.copy;
  const Copied = icon.copied;
  const Smile = icon.smile;
  const Reply = icon.reply;
  const More = icon.more;
  const Aloud = icon.aloud;
  const Fork = icon.fork;
  const Report = icon.report;
  const Search = icon.search;
  const AddEmoji = icon.addEmoji;
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const popId = useId();
  const menuId = useId();
  const [postedAt] = useState(() => sentAt ?? new Date(Date.now() - 3 * 60 * 1000));
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 900);
    return () => window.clearTimeout(timer);
  }, [copied]);

  useEffect(() => {
    if (!panel) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || pickerRef.current?.contains(target)) return;
      setPanel(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPanel(null);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [panel]);

  useEffect(() => {
    if (panel === "react") return;
    setPickerOpen(false);
    setQuery("");
  }, [panel]);

  useEffect(() => {
    if (panel === "react" || !extraOut) return;
    setExtra(null);
    setExtraOut(false);
  }, [panel, extraOut]);

  useEffect(() => {
    if (!pickerOpen) return;
    searchRef.current?.focus();
  }, [pickerOpen]);

  const choose = (next: Vote) => {
    const value = vote === next ? null : next;
    setVote(value);
    onVote?.(value);
    if (next === "up") setUpN((n) => n + 1);
    if (next === "down") setDownN((n) => n + 1);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* preview still shows the drawn check */
    }
    setCopied(true);
    onCopy?.(text);
  };

  const react = (emoji: string) => {
    const value = reaction === emoji ? null : emoji;
    const preset = (REACTIONS as readonly string[]).includes(emoji);
    const fromRow = panel === "react" && !pickerOpen;
    setReaction(value);
    onReact?.(value);
    setPickerOpen(false);
    setQuery("");

    if (!preset && value) {
      setExtra(emoji);
      setExtraOut(false);
      setPanel(null);
      return;
    }

    const leaveExtra =
      extra !== null && (value === null && emoji === extra || (value !== null && value !== extra));
    if (leaveExtra && fromRow && emoji === extra) {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        setExtra(null);
        setExtraOut(false);
      } else {
        setExtraOut(true);
      }
      return;
    }
    if (leaveExtra) {
      setExtra(null);
      setExtraOut(false);
    }
    setPanel(null);
  };

  const emojiGroups = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return EMOJI_GROUPS;
    return EMOJI_GROUPS.map((group) => ({
      label: group.label,
      items: group.items.filter(([, keywords]) => keywords.includes(q)),
    })).filter((group) => group.items.length > 0);
  }, [query]);

  const placePicker = useCallback(() => {
    const anchor = rootRef.current;
    const picker = pickerRef.current;
    if (!anchor || !picker) return;
    const rect = anchor.getBoundingClientRect();
    const width = picker.offsetWidth;
    const height = picker.offsetHeight;
    let left = rect.left;
    let top = rect.top - height - 8;
    if (top < 8) top = rect.bottom + 8;
    left = Math.min(Math.max(8, left), window.innerWidth - width - 8);
    picker.style.left = `${Math.round(left)}px`;
    picker.style.top = `${Math.round(top)}px`;
  }, []);

  useIsoLayoutEffect(() => {
    if (!pickerOpen) return;
    placePicker();
    window.addEventListener("scroll", placePicker, true);
    window.addEventListener("resize", placePicker);
    return () => {
      window.removeEventListener("scroll", placePicker, true);
      window.removeEventListener("resize", placePicker);
    };
  }, [pickerOpen, query, placePicker]);

  const reply = () => {
    setReplyN((n) => n + 1);
    setPanel(null);
    onReply?.();
  };

  const more = (action: "aloud" | "fork" | "report") => {
    if (action === "fork") onFork?.();
    setPanel(null);
  };

  return (
    <RowCues>
    <CueRoot rootRef={rootRef}>
      <Cue label="Good response">
      <button
        type="button"
        className={styles.btn}
        data-on={vote === "up"}
        aria-pressed={vote === "up"}
        aria-label="Good response"
        onClick={() => choose("up")}
      >
        <Good
          key={upN}
          className={`${styles.glyph} ${styles.voteUp} ${upN ? styles.bumpUp : ""}`}
          size={12}
        />
      </button>
      </Cue>

      <Cue label="Bad response">
      <button
        type="button"
        className={styles.btn}
        data-on={vote === "down"}
        aria-pressed={vote === "down"}
        aria-label="Bad response"
        onClick={() => choose("down")}
      >
        <Bad
          key={downN}
          className={`${styles.glyph} ${styles.glyphDown} ${styles.voteDown} ${downN ? styles.bumpDown : ""}`}
          size={12}
        />
      </button>
      </Cue>

      <Cue label={copied ? "Copied" : "Copy message"}>
      <button
        type="button"
        className={styles.btn}
        aria-label={copied ? "Copied" : "Copy message"}
        onClick={copy}
      >
        <span className={styles.copySwap} data-on={copied ? "true" : "false"}>
          <Copy className={`${styles.glyph} ${styles.copyMark}`} size={12} />
          <Copied className={`${styles.glyph} ${styles.check}`} size={12} />
        </span>
      </button>
      </Cue>

      <Cue label={reaction ? `Reaction ${reaction}` : "Add reaction"} quiet={panel === "react"}>
      <button
        type="button"
        className={styles.btn}
        data-on={panel === "react" || reaction !== null}
        aria-expanded={panel === "react"}
        aria-controls={popId}
        aria-label={reaction ? `Reaction ${reaction}` : "Add reaction"}
        onClick={() => {
          setSmileN((n) => n + 1);
          setPanel((value) => (value === "react" ? null : "react"));
        }}
      >
        {reaction ? (
          <span key={reaction} className={`${styles.reaction} ${styles.mark}`} aria-hidden="true">{reaction}</span>
        ) : (
          <Smile
            key={smileN}
            className={`${styles.glyph} ${styles.smile} ${smileN ? styles.smilePlay : ""}`}
            size={12}
          />
        )}
      </button>
      </Cue>

      <Cue label="Reply">
      <button type="button" className={styles.btn} aria-label="Reply" onClick={reply}>
        <Reply
          key={replyN}
          className={`${styles.glyph} ${styles.reply} ${replyN ? styles.replyPlay : ""}`}
          size={12}
        />
      </button>
      </Cue>

      <span className={styles.slot}>
        <Cue label="More actions" quiet={panel === "more"}>
        <button
          type="button"
          className={styles.btn}
          data-on={panel === "more"}
          aria-expanded={panel === "more"}
          aria-controls={menuId}
          aria-haspopup="menu"
          aria-label="More actions"
          onClick={() => setPanel((value) => (value === "more" ? null : "more"))}
        >
          <More className={styles.glyph} size={12} />
        </button>
        </Cue>
        {panel === "more" ? (
          <div id={menuId} className={styles.menu} role="menu">
            <button type="button" className={styles.item} role="menuitem" onClick={() => more("aloud")}>
              <Aloud size={12} />
              Read aloud
            </button>
            <button type="button" className={styles.item} role="menuitem" onClick={() => more("fork")}>
              <Fork size={12} />
              Fork chat
            </button>
            <div className={styles.rule} role="separator" />
            <button type="button" className={`${styles.item} ${styles.danger}`} role="menuitem" onClick={() => more("report")}>
              <Report size={12} />
              Report
            </button>
          </div>
        ) : null}
      </span>

      {panel === "react" && !pickerOpen ? (
        <div id={popId} ref={popRef} className={styles.pop} role="menu">
          {REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={styles.emoji}
              role="menuitem"
              data-on={reaction === emoji}
              aria-label={emoji}
              onClick={() => react(emoji)}
            >
              <span className={styles.mark}>{emoji}</span>
            </button>
          ))}
          {extra ? (
            <button
              type="button"
              className={`${styles.emoji} ${extraOut ? styles.emojiOut : ""}`}
              role="menuitem"
              data-on={!extraOut && reaction === extra}
              aria-label={extra}
              onClick={() => react(extra)}
              onAnimationEnd={(event) => {
                if (event.target !== event.currentTarget || !extraOut) return;
                setExtra(null);
                setExtraOut(false);
              }}
            >
              <span className={styles.mark}>{extra}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={styles.moreEmoji}
            data-on={pickerOpen}
            aria-expanded={pickerOpen}
            aria-label="Search emoji"
            onClick={() => setPickerOpen((open) => !open)}
          >
            <AddEmoji size={16} />
          </button>
        </div>
      ) : null}

      {panel === "react" && pickerOpen
        ? createPortal(
            <div
              ref={pickerRef}
              className={styles.picker}
              data-theme={rootRef.current?.closest("[data-theme]")?.getAttribute("data-theme") === "dark" ? "dark" : "light"}
              role="dialog"
              aria-label="Search emoji"
            >
              <label className={styles.search}>
                <Search size={16} />
                <input
                  ref={searchRef}
                  value={query}
                  placeholder="Search emoji"
                  aria-label="Search emoji"
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              <div className={styles.pickerScroll}>
                {emojiGroups.length === 0 ? (
                  <p className={styles.empty}>No emoji found</p>
                ) : (
                  emojiGroups.map((group) => (
                    <section key={group.label}>
                      <p className={styles.groupLabel}>{group.label}</p>
                      <div className={styles.grid}>
                        {group.items.map(([emoji]) => (
                          <button
                            key={emoji}
                            type="button"
                            className={styles.cell}
                            data-on={reaction === emoji}
                            aria-label={emoji}
                            onClick={() => react(emoji)}
                          >
                            <span className={styles.mark}>{emoji}</span>
                          </button>
                        ))}
                      </div>
                    </section>
                  ))
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

      <Cue label={formatAbsolute(postedAt)}>
        <time className={styles.ago} dateTime={postedAt.toISOString()}>
          {elapsedMinutes(postedAt, now) >= 1 && elapsedMinutes(postedAt, now) < 60 ? (
            <>
              <MinuteRoll value={String(elapsedMinutes(postedAt, now))} />
              m ago
            </>
          ) : (
            formatAgo(postedAt, now)
          )}
        </time>
      </Cue>
    </CueRoot>
    </RowCues>
  );
}
