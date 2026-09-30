"use client";

import { Fragment, useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./SecureInput.module.css";

export const SECURE_INPUT_PRESETS = ["secret", "login", "otp", "card", "pin"] as const;

export type SecureInputPreset = (typeof SECURE_INPUT_PRESETS)[number];

export const SECURE_INPUT_LABELS: Record<SecureInputPreset, string> = {
  secret: "Code",
  login: "Login",
  otp: "OTP",
  card: "Card",
  pin: "PIN",
};

export type SecureInputValues = Record<string, string>;

export type SecureInputState = "form" | "sending" | "filled" | "failed" | "dismissed";

type Phase = SecureInputState;

const COPY: Record<SecureInputPreset, { title: string; description: string }> = {
  secret: {
    title: "SMS code",
    description: "A code was just sent to +1 555 013 482.",
  },
  login: {
    title: "Page login",
    description: "Sign in to the account that manages this page. Posts go out as the page.",
  },
  otp: {
    title: "Authenticator code",
    description: "Enter the 6-digit code from the authenticator app.",
  },
  card: {
    title: "Checkout",
    description: "The payment page is waiting on the card. These details are filled into that page.",
  },
  pin: {
    title: "Lock screen",
    description: "Enter the 4-digit PIN so it can be typed into the lock screen.",
  },
};

function digits(value: string, max: number) {
  return value.replace(/\D/g, "").slice(0, max);
}

function formatCard(value: string) {
  return digits(value, 16).replace(/(\d{4})(?=\d)/g, "$1 ");
}

function formatExpiry(value: string) {
  const raw = digits(value, 4);
  if (raw.length <= 2) return raw;
  return `${raw.slice(0, 2)}/${raw.slice(2)}`;
}

function emailOk(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

function expiryOk(value: string) {
  const match = /^(\d{2})\/(\d{2})$/.exec(value);
  if (!match) return false;
  const month = Number(match[1]);
  return month >= 1 && month <= 12;
}

function started(values: SecureInputValues) {
  return Object.values(values).some((value) => value.trim().length > 0);
}

function ready(preset: SecureInputPreset, values: SecureInputValues) {
  if (preset === "secret") return (values.code ?? "").trim().length > 0;
  if (preset === "login") return emailOk(values.email ?? "") && (values.password ?? "").length > 0;
  if (preset === "otp") return (values.code ?? "").length === 6;
  if (preset === "pin") return (values.pin ?? "").length === 4;
  return digits(values.number ?? "", 16).length === 16 && expiryOk(values.expiry ?? "") && digits(values.cvc ?? "", 4).length >= 3;
}

function payload(preset: SecureInputPreset, values: SecureInputValues): SecureInputValues {
  if (preset === "card") {
    return {
      number: digits(values.number ?? "", 16),
      expiry: values.expiry ?? "",
      cvc: digits(values.cvc ?? "", 4),
    };
  }
  return values;
}

function Ring() {
  return (
    <svg className={styles.spin} viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" opacity="0.28" />
      <path d="M8 2.5a5.5 5.5 0 0 1 5.5 5.5" stroke="currentColor" strokeWidth="1.25" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
    </svg>
  );
}

function Screen() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect width="20" height="14" x="2" y="3" rx="2" vectorEffect="non-scaling-stroke" />
      <path d="M8 21h8" vectorEffect="non-scaling-stroke" />
      <path d="M12 17v4" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Tip({ label, children }: { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useLayoutEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const tip = tipRef.current;
    if (!trigger || !tip) return;
    const from = trigger.closest("[data-theme]")?.getAttribute("data-theme");
    const next =
      from === "dark" || from === "light"
        ? from
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setTheme(next);
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      setPos({
        left: Math.round(rect.left + rect.width / 2 - tip.offsetWidth / 2),
        top: Math.round(rect.top - tip.offsetHeight - 6),
      });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <span
      ref={triggerRef}
      className={styles.tipHost}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {mounted &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className={styles.tip}
            data-theme={theme}
            data-up={open && pos ? "" : undefined}
            style={pos ? { left: pos.left, top: pos.top } : undefined}
          >
            {label}
          </div>,
          document.body,
        )}
    </span>
  );
}

function Eye({ off }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {off ? (
        <>
          <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c5.5 0 9.3 4.2 10.4 6.1a1 1 0 0 1 0 .8 16 16 0 0 1-3.2 3.8" vectorEffect="non-scaling-stroke" />
          <path d="M6.6 6.6A16 16 0 0 0 1.6 11.1a1 1 0 0 0 0 .8C2.7 14.8 6.5 19 12 19a10 10 0 0 0 4.2-.9" vectorEffect="non-scaling-stroke" />
          <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" vectorEffect="non-scaling-stroke" />
          <path d="m3 3 18 18" vectorEffect="non-scaling-stroke" />
        </>
      ) : (
        <>
          <path d="M2.1 12.3a1 1 0 0 1 0-.6C3.2 9.2 7 5 12 5s8.8 4.2 9.9 6.7a1 1 0 0 1 0 .6C20.8 14.8 17 19 12 19s-8.8-4.2-9.9-6.7" vectorEffect="non-scaling-stroke" />
          <circle cx="12" cy="12" r="3" vectorEffect="non-scaling-stroke" />
        </>
      )}
    </svg>
  );
}

function Cells({
  length,
  value,
  label,
  onChange,
}: {
  length: number;
  value: string;
  label: string;
  onChange: (next: string) => void;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length }, (_, index) => value[index] ?? "");

  const write = (next: string, focus: number) => {
    onChange(next.slice(0, length));
    refs.current[Math.max(0, Math.min(focus, length - 1))]?.focus();
  };

  const onKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      if (chars[index]) write(value.slice(0, index) + value.slice(index + 1), index);
      else if (index > 0) write(value.slice(0, index - 1) + value.slice(index), index - 1);
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) refs.current[index - 1]?.focus();
    if (event.key === "ArrowRight" && index < length - 1) refs.current[index + 1]?.focus();
  };

  return (
    <div className={styles.field}>
      <span className={styles.label} id={`${label}-cells`}>
        {label}
        <span className={styles.req}> *</span>
      </span>
      <div
        className={styles.cells}
        role="group"
        aria-labelledby={`${label}-cells`}
        onPaste={(event) => {
          const text = event.clipboardData.getData("text").replace(/\D/g, "");
          if (!text) return;
          event.preventDefault();
          write(text, Math.min(text.length, length) - 1);
        }}
      >
        {chars.map((char, index) => (
          <Fragment key={index}>
            {length === 6 && index === 3 ? <span className={styles.sep} aria-hidden /> : null}
            <input
              ref={(node) => {
                refs.current[index] = node;
              }}
              className={styles.cell}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={1}
              value={char}
              aria-label={`${label}, digit ${index + 1} of ${length}`}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => {
                const digit = event.target.value.replace(/\D/g, "").slice(-1);
                if (!digit) return;
                const next = (value.slice(0, index) + digit + value.slice(index + 1)).slice(0, length);
                write(next, index + 1);
              }}
              onKeyDown={(event) => onKeyDown(index, event)}
            />
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function SecretField({
  id,
  label,
  type,
  value,
  autoComplete,
  inputMode,
  revealed,
  onReveal,
  onChange,
}: {
  id: string;
  label: string;
  type: "text" | "email" | "password";
  value: string;
  autoComplete?: string;
  inputMode?: "text" | "email" | "numeric";
  revealed?: boolean;
  onReveal?: () => void;
  onChange: (value: string) => void;
}) {
  const secret = type === "password";
  return (
    <label className={styles.field} htmlFor={id}>
      <span className={styles.label}>
        {label}
        <span className={styles.req}> *</span>
      </span>
      <span className={styles.control}>
        <input
          id={id}
          className={styles.input}
          data-secret={secret ? "" : undefined}
          type={secret && !revealed ? "password" : type === "password" ? "text" : type}
          inputMode={inputMode}
          autoComplete={autoComplete}
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {secret && onReveal && (
          <button type="button" className={styles.eye} aria-label={revealed ? "Hide password" : "Show password"} aria-pressed={revealed} onClick={onReveal}>
            <Eye off={revealed} />
          </button>
        )}
      </span>
    </label>
  );
}

export function SecureInput({
  preset = "login",
  title,
  description,
  continueLabel = "Continue",
  openLabel = "Open on Screen",
  dismissLabel = "Dismiss",
  state,
  onContinue,
  onOpenScreen,
  onDismiss,
}: {
  preset?: SecureInputPreset;
  title?: string;
  description?: string;
  continueLabel?: string;
  openLabel?: string;
  dismissLabel?: string;
  /** Pins a result banner. Omit it and the card moves through the states itself. */
  state?: SecureInputState;
  onContinue?: (values: SecureInputValues) => void | boolean | Promise<void | boolean>;
  onOpenScreen?: () => void;
  onDismiss?: () => void;
}) {
  const uid = useId();
  const copy = COPY[preset];
  const [values, setValues] = useState<SecureInputValues>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [phase, setPhase] = useState<Phase>(state ?? "form");
  const shownPhase = state ?? phase;
  const canContinue = ready(preset, values);

  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canContinue || shownPhase === "sending") return;
    setPhase("sending");
    try {
      const result = await onContinue?.(payload(preset, values));
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      setPhase(result === false ? "failed" : "filled");
    } catch {
      setPhase("failed");
    }
  };

  const heading = title ?? copy.title;

  if (shownPhase !== "form") {
    const note =
      shownPhase === "sending"
        ? "Sending..."
        : shownPhase === "filled"
          ? "Filled into the page."
          : shownPhase === "failed"
            ? "Could not fill into the page — it may have moved or changed. Secret values were never shown to your Bot."
            : started(values)
              ? "Dismissed without sending."
              : "Dismissed without filling anything.";
    const pill = shownPhase === "sending" ? "Sending" : shownPhase === "filled" ? "Filled" : shownPhase === "failed" ? "Not filled" : "Dismissed";
    return (
      <div className={`${styles.card} ${styles.settled}`} data-preset={preset} data-state={shownPhase}>
        <div className={styles.copy}>
          <p className={styles.title}>{heading}</p>
          <p className={styles.description}>{note}</p>
        </div>
        <span className={styles.status} data-tone={shownPhase === "failed" ? "failed" : undefined}>
          {shownPhase === "sending" && <Ring />}
          {pill}
        </span>
      </div>
    );
  }

  return (
    <form className={styles.card} data-preset={preset} onSubmit={submit}>
      <div className={styles.copy}>
        <p className={styles.title}>{title ?? copy.title}</p>
        <p className={styles.description}>
          {description ??
            (preset === "secret" ? (
              <>
                A code was just sent to{" "}
                <span className={styles.phone}>
                  <span className={styles.flag} aria-hidden>
                    🇺🇸
                  </span>
                  +1 555 013 482
                </span>
                {"."}
              </>
            ) : (
              copy.description
            ))}
        </p>
      </div>

      <div className={styles.fields}>
        {preset === "secret" && (
          <SecretField id={`${uid}-code`} label="SMS code" type="text" autoComplete="one-time-code" value={values.code ?? ""} onChange={(value) => set("code", value)} />
        )}

        {preset === "login" && (
          <>
            <SecretField id={`${uid}-email`} label="Email or phone" type="email" inputMode="email" autoComplete="username" value={values.email ?? ""} onChange={(value) => set("email", value)} />
            <SecretField
              id={`${uid}-password`}
              label="Password"
              type="password"
              autoComplete="current-password"
              value={values.password ?? ""}
              revealed={shown.password}
              onReveal={() => setShown((current) => ({ ...current, password: !current.password }))}
              onChange={(value) => set("password", value)}
            />
          </>
        )}

        {preset === "otp" && <Cells length={6} label="Code" value={values.code ?? ""} onChange={(value) => set("code", value)} />}
        {preset === "pin" && <Cells length={4} label="PIN" value={values.pin ?? ""} onChange={(value) => set("pin", value)} />}

        {preset === "card" && (
          <>
            <label className={styles.field} htmlFor={`${uid}-number`}>
              <span className={styles.label}>
                Card number
                <span className={styles.req}> *</span>
              </span>
              <input
                id={`${uid}-number`}
                className={styles.input}
                inputMode="numeric"
                autoComplete="cc-number"
                spellCheck={false}
                value={values.number ?? ""}
                onChange={(event) => set("number", formatCard(event.target.value))}
              />
            </label>
            <div className={styles.split}>
              <label className={styles.field} htmlFor={`${uid}-expiry`}>
                <span className={styles.label}>
                  Expiry
                  <span className={styles.req}> *</span>
                </span>
                <input
                  id={`${uid}-expiry`}
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="cc-exp"
                  placeholder="MM/YY"
                  spellCheck={false}
                  value={values.expiry ?? ""}
                  onChange={(event) => set("expiry", formatExpiry(event.target.value))}
                />
              </label>
              <label className={styles.field} htmlFor={`${uid}-cvc`}>
                <span className={styles.label}>
                  CVC
                  <span className={styles.req}> *</span>
                </span>
                <input
                  id={`${uid}-cvc`}
                  className={styles.input}
                  inputMode="numeric"
                  autoComplete="cc-csc"
                  spellCheck={false}
                  value={values.cvc ?? ""}
                  onChange={(event) => set("cvc", digits(event.target.value, 4))}
                />
              </label>
            </div>
          </>
        )}
      </div>

      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={!canContinue}>
          {continueLabel}
        </button>
        <button
          type="button"
          className={styles.ghost}
          onClick={() => {
            onDismiss?.();
            setPhase("dismissed");
          }}
        >
          {dismissLabel}
        </button>
        <Tip label={openLabel}>
          <button type="button" className={styles.iconBtn} aria-label={openLabel} onClick={() => onOpenScreen?.()}>
            <Screen />
          </button>
        </Tip>
      </div>
    </form>
  );
}
