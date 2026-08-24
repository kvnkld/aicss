"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  CornerDownLeft,
  Download,
  ListChecks,
  ListTodo,
  Maximize2,
  MessageCircleQuestion,
  Terminal,
  X,
} from "lucide-react";
import styles from "./ApprovalCard.module.css";

export type ApprovalVariant = "questions" | "command" | "plan";

export interface ApprovalQuestion {
  id: string;
  prompt: string;
  options: string[];
}

export interface ApprovalPlanStep {
  id: string;
  title: string;
  detail?: string;
}

const DEFAULT_QUESTIONS: ApprovalQuestion[] = [
  {
    id: "q1",
    prompt: "Which auth approach should we use?",
    options: ["Session cookies", "JWT bearer", "OAuth only"],
  },
  {
    id: "q2",
    prompt: "Where should secrets live?",
    options: [".env.local", "Vault / secrets manager", "CI only"],
  },
  {
    id: "q3",
    prompt: "Ship behind a feature flag?",
    options: ["Yes - gradual rollout", "No - full release"],
  },
];

const DEFAULT_COMMAND = "pnpm db:migrate && pnpm build";

const DEFAULT_PLAN: ApprovalPlanStep[] = [
  {
    id: "p1",
    title: "Add migration for sessions table",
    detail: "Create + apply SQL, keep rollback script",
  },
  {
    id: "p2",
    title: "Wire auth middleware",
    detail: "Protect /account and /api/checkout",
  },
  {
    id: "p3",
    title: "Update login flow + tests",
    detail: "Magic-link path and happy-path e2e",
  },
  {
    id: "p4",
    title: "Add account settings page",
    detail: "Profile, sessions, and danger zone",
  },
  {
    id: "p5",
    title: "Tighten CSRF + rate limits",
    detail: "Protect auth and checkout endpoints",
  },
  {
    id: "p6",
    title: "Write rollout notes",
    detail: "Changelog + support snippet",
  },
];

const DEFAULT_PLAN_PREVIEW = 3;
const DEFAULT_PLAN_TITLE = "Session auth migration";
const DEFAULT_PLAN_SUMMARY =
  "Ship cookie-based sessions with middleware and tests.\nIncludes a safe rollout path for production.";
const AUTO_APPROVE_SECS = 30;
const ADVANCE_MS = 320;
const ROLL_MS = 400;

function RollingDigits({ value }: { value: string }) {
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
    setDir(
      Number.isFinite(fromN) && Number.isFinite(toN) && toN < fromN
        ? "down"
        : "up",
    );
    setOldVal(from);
    setNewVal(value);
    setRolling(true);
    setShifted(false);

    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setShifted(true));
    });
    const done = setTimeout(() => {
      setRolling(false);
      setOldVal(value);
      setShifted(false);
    }, ROLL_MS);

    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(done);
    };
  }, [value]);

  const chars = rolling ? newVal : oldVal;

  return (
    <>
      {Array.from({ length: chars.length }, (_, i) => {
        const o = oldVal[i] ?? "";
        const n = chars[i] ?? "";
        if (!rolling || o === n) {
          return (
            <span key={`${i}-${n}`} className={styles.digitStatic}>
              {n}
            </span>
          );
        }
        const top = dir === "down" ? n : o;
        const bottom = dir === "down" ? o : n;
        return (
          <span key={`${i}-${o}-${n}-${dir}`} className={styles.digitRoll}>
            <span
              className={styles.digitRollInner}
              data-dir={dir}
              data-shifted={shifted ? "true" : undefined}
            >
              <span>{top}</span>
              <span>{bottom}</span>
            </span>
          </span>
        );
      })}
    </>
  );
}

function TodoDashedIcon() {
  const dots = 12;
  const dash = 0.022;
  const gap = 1 / dots - dash;
  return (
    <svg
      className={styles.todoIcon}
      viewBox="0 0 24 24"
      width="16"
      height="16"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        pathLength={1}
        strokeDasharray={`${dash} ${gap}`}
        strokeLinecap="round"
      />
    </svg>
  );
}

export interface ApprovalCardProps {
  variant?: ApprovalVariant;
  questions?: ApprovalQuestion[];
  command?: string;
  cwd?: string;
  plan?: ApprovalPlanStep[];
  planTitle?: string;
  planSummary?: string;
  planPreviewCount?: number;
  title?: string;
  approveLabel?: string;
  rejectLabel?: string;
  onApprove?: (payload?: { answers?: Record<string, string> }) => void;
  onReject?: () => void;
  className?: string;
}

export function ApprovalCard({
  variant = "questions",
  questions = DEFAULT_QUESTIONS,
  command = DEFAULT_COMMAND,
  cwd = "~/aicss",
  plan = DEFAULT_PLAN,
  planTitle,
  planSummary,
  planPreviewCount = DEFAULT_PLAN_PREVIEW,
  title,
  approveLabel,
  rejectLabel,
  onApprove,
  onReject,
  className,
}: ApprovalCardProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [otherSelected, setOtherSelected] = useState<Record<string, boolean>>(
    {},
  );
  const [customDraft, setCustomDraft] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0);
  const [planExpanded, setPlanExpanded] = useState(false);
  const [autoSecs, setAutoSecs] = useState(AUTO_APPROVE_SECS);
  const [autoUI, setAutoUI] = useState<"active" | "leaving" | "gone">("active");
  const advanceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoFired = useRef(false);
  const questionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const customInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const qMeasured = useRef(false);
  const [qViewportH, setQViewportH] = useState<number | undefined>(undefined);
  const [qTrackY, setQTrackY] = useState(0);
  const [qAnimate, setQAnimate] = useState(false);

  useEffect(() => {
    return () => {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      if (autoFadeTimer.current) clearTimeout(autoFadeTimer.current);
    };
  }, []);

  const safeStep = Math.min(step, Math.max(questions.length - 1, 0));
  const allAnswered =
    questions.length > 0 &&
    questions.every((q) => Boolean(answers[q.id]?.trim()));
  const stepLabel = `${safeStep + 1} / ${questions.length}`;

  const isOtherChoice = (q: ApprovalQuestion) => {
    if (otherSelected[q.id]) return true;
    const a = answers[q.id];
    return Boolean(a) && !q.options.includes(a);
  };

  const syncQuestionSlide = (animate: boolean) => {
    const item = questionRefs.current[safeStep];
    if (!item) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setQViewportH(item.offsetHeight + 2);
    setQTrackY(item.offsetTop);
    setQAnimate(animate && !reduce);
  };

  useLayoutEffect(() => {
    if (variant !== "questions") {
      qMeasured.current = false;
      setQViewportH(undefined);
      setQTrackY(0);
      setQAnimate(false);
      return;
    }
    const animate = qMeasured.current;
    qMeasured.current = true;
    syncQuestionSlide(animate);
  }, [variant, safeStep, questions, answers]);

  useEffect(() => {
    if (variant !== "questions") return;
    const id = requestAnimationFrame(() => syncQuestionSlide(qMeasured.current));
    return () => cancelAnimationFrame(id);
  }, [variant, safeStep, questions]);

  const previewCount = Math.max(0, planPreviewCount);
  const planPreview = plan.slice(0, previewCount);
  const planRest = plan.slice(previewCount);
  const hasPlanMore = planRest.length > 0;
  const showPlanRest = planExpanded || !hasPlanMore;

  const resolvedPlanTitle = planTitle ?? DEFAULT_PLAN_TITLE;
  const resolvedPlanSummary = planSummary ?? DEFAULT_PLAN_SUMMARY;

  const resolvedTitle =
    title ??
    (variant === "questions"
      ? "Questions"
      : variant === "command"
        ? "Run this command?"
        : "Plan Overview");

  const resolvedApprove =
    approveLabel ??
    (variant === "questions"
      ? "Continue"
      : variant === "command"
        ? "Run"
        : "Approve");

  const resolvedReject =
    rejectLabel ?? (variant === "plan" ? "View Plan" : "Skip");

  const canContinue = variant !== "questions" || allAnswered;

  const handleApprove = (nextAnswers?: Record<string, string>) => {
    if (variant === "questions") {
      const a = nextAnswers ?? answers;
      const ok = questions.every((q) => Boolean(a[q.id]?.trim()));
      if (!ok) return;
      onApprove?.({ answers: a });
      return;
    }
    onApprove?.();
  };

  const handleReject = () => {
    onReject?.();
  };

  const cancelAutoApprove = () => {
    if (autoUI !== "active") return;
    autoFired.current = true;
    setAutoUI("leaving");
    if (autoFadeTimer.current) clearTimeout(autoFadeTimer.current);
    autoFadeTimer.current = setTimeout(() => setAutoUI("gone"), 280);
  };

  useEffect(() => {
    if (variant !== "plan" || autoUI !== "active") return;
    const id = window.setInterval(() => {
      setAutoSecs((s) => Math.max(0, s - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [variant, autoUI]);

  useEffect(() => {
    if (variant !== "plan" || autoUI !== "active") return;
    if (autoSecs > 0 || autoFired.current) return;
    autoFired.current = true;
    onApprove?.();
  }, [autoSecs, variant, autoUI, onApprove]);

  const selectOption = (questionId: string, opt: string) => {
    setOtherSelected((prev) => ({ ...prev, [questionId]: false }));
    setAnswers((prev) => ({ ...prev, [questionId]: opt }));
    if (safeStep < questions.length - 1) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      advanceTimer.current = setTimeout(() => {
        setStep((s) => Math.min(s + 1, questions.length - 1));
      }, ADVANCE_MS);
    }
  };

  const selectOther = (questionId: string) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setOtherSelected((prev) => ({ ...prev, [questionId]: true }));
    const draft = customDraft[questionId]?.trim() ?? "";
    setAnswers((prev) => {
      const next = { ...prev };
      if (draft) next[questionId] = draft;
      else delete next[questionId];
      return next;
    });
    requestAnimationFrame(() => {
      customInputRefs.current[questionId]?.focus();
    });
  };

  const updateCustom = (questionId: string, text: string) => {
    setCustomDraft((prev) => ({ ...prev, [questionId]: text }));
    setOtherSelected((prev) => ({ ...prev, [questionId]: true }));
    setAnswers((prev) => {
      const next = { ...prev };
      const trimmed = text.trim();
      if (trimmed) next[questionId] = trimmed;
      else delete next[questionId];
      return next;
    });
  };

  const commitCustom = (questionId: string, raw?: string) => {
    const text = (raw ?? customDraft[questionId] ?? answers[questionId] ?? "").trim();
    if (!text) return;
    setCustomDraft((prev) => ({
      ...prev,
      [questionId]: raw ?? prev[questionId] ?? text,
    }));
    setOtherSelected((prev) => ({ ...prev, [questionId]: true }));
    const nextAnswers = { ...answers, [questionId]: text };
    setAnswers(nextAnswers);
    if (safeStep < questions.length - 1) {
      if (advanceTimer.current) clearTimeout(advanceTimer.current);
      setStep((s) => Math.min(s + 1, questions.length - 1));
      return;
    }
    handleApprove(nextAnswers);
  };

  const goToStep = (next: number) => {
    if (advanceTimer.current) clearTimeout(advanceTimer.current);
    setStep(Math.min(Math.max(next, 0), questions.length - 1));
  };

  const Icon =
    variant === "questions"
      ? MessageCircleQuestion
      : variant === "command"
        ? Terminal
        : ListTodo;

  return (
    <div
      className={`${styles.card}${className ? ` ${className}` : ""}`}
      data-variant={variant}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        if (variant !== "questions") return;
        if (safeStep !== questions.length - 1 || !canContinue) return;
        const el = e.target as HTMLElement;
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return;
        if (
          el.closest(`.${styles.btnGhost}`) ||
          el.closest(`.${styles.btnPrimary}`)
        ) {
          return;
        }
        e.preventDefault();
        handleApprove();
      }}
    >
      <div className={styles.head}>
        <span className={styles.icon} data-variant={variant}>
          <Icon className={styles.iconSvg} aria-hidden />
        </span>
        <div className={styles.headText}>
          <div className={styles.title}>{resolvedTitle}</div>
        </div>
        {variant === "plan" && (
          <div className={styles.headActions}>
            <button
              type="button"
              className={styles.headAction}
              aria-label="Download plan"
              onClick={(e) => e.preventDefault()}
            >
              <Download className={styles.headActionIcon} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              className={styles.headAction}
              aria-label="Expand plan"
              onClick={(e) => {
                e.preventDefault();
                setPlanExpanded(true);
              }}
            >
              <Maximize2 className={styles.headActionIcon} strokeWidth={2} aria-hidden />
            </button>
          </div>
        )}
      </div>

      {variant === "questions" && questions.length > 0 && (
        <div
          className={styles.questionsViewport}
          style={qViewportH != null ? { height: qViewportH } : undefined}
          data-animate={qAnimate ? "true" : undefined}
          aria-live="polite"
        >
          <div
            className={styles.questionsTrack}
            style={{ transform: `translate3d(0, ${-qTrackY}px, 0)` }}
            data-animate={qAnimate ? "true" : undefined}
          >
            {questions.map((q, qi) => {
              const active = qi === safeStep;
              return (
                <div
                  key={q.id}
                  ref={(el) => {
                    questionRefs.current[qi] = el;
                  }}
                  className={styles.question}
                  data-active={active ? "true" : undefined}
                  aria-hidden={active ? undefined : true}
                >
                  <div className={styles.qPrompt}>{q.prompt}</div>
                  <div
                    className={styles.options}
                    role="radiogroup"
                    aria-label={q.prompt}
                  >
                    {q.options.map((opt, oi) => {
                      const selected =
                        answers[q.id] === opt && !isOtherChoice(q);
                      const letter = String.fromCharCode(65 + oi);
                      return (
                        <button
                          key={opt}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          tabIndex={active ? 0 : -1}
                          className={styles.option}
                          data-selected={selected ? "true" : undefined}
                          onClick={(e) => {
                            e.preventDefault();
                            if (!active) return;
                            selectOption(q.id, opt);
                          }}
                        >
                          <span className={styles.key} aria-hidden>
                            {letter}
                          </span>
                          {opt}
                        </button>
                      );
                    })}
                    {(() => {
                      const otherLetter = String.fromCharCode(
                        65 + q.options.length,
                      );
                      const otherOn = isOtherChoice(q);
                      const draft =
                        customDraft[q.id] ??
                        (otherOn &&
                        answers[q.id] &&
                        !q.options.includes(answers[q.id])
                          ? answers[q.id]
                          : "");
                      return (
                        <div
                          role="radio"
                          aria-checked={otherOn}
                          tabIndex={active ? 0 : -1}
                          className={styles.option}
                          data-selected={otherOn ? "true" : undefined}
                          data-other="true"
                          onClick={(e) => {
                            e.preventDefault();
                            if (!active) return;
                            selectOther(q.id);
                          }}
                          onKeyDown={(e) => {
                            if (!active) return;
                            if (e.target !== e.currentTarget) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              selectOther(q.id);
                            }
                          }}
                        >
                          <span className={styles.key} aria-hidden>
                            {otherLetter}
                          </span>
                          <input
                            ref={(el) => {
                              customInputRefs.current[q.id] = el;
                            }}
                            className={styles.optionInput}
                            type="text"
                            value={draft}
                            placeholder="Something else…"
                            tabIndex={active && otherOn ? 0 : -1}
                            aria-label={`Custom answer for: ${q.prompt}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!active) return;
                              selectOther(q.id);
                            }}
                            onChange={(e) => {
                              if (!active) return;
                              updateCustom(q.id, e.target.value);
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation();
                              if (!active) return;
                              if (e.key === "Enter") {
                                e.preventDefault();
                                commitCustom(q.id, e.currentTarget.value);
                              }
                            }}
                          />
                        </div>
                      );
                    })()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {variant === "command" && (
        <div className={styles.cmdBlock}>
          <div className={styles.cwd}>{cwd}</div>
          <pre className={styles.cmd}>{command}</pre>
        </div>
      )}

      {variant === "plan" && (
        <>
          <div className={styles.planIntro}>
            <div className={styles.planHeadline}>{resolvedPlanTitle}</div>
            <div className={styles.planSummary}>{resolvedPlanSummary}</div>
          </div>
          <div className={styles.todoWell}>
            <div className={styles.todoHead}>
              <span className={styles.todoHeadIcon}>
                <ListChecks
                  className={styles.todoListIcon}
                  strokeWidth={2}
                  aria-hidden
                />
              </span>
              <span className={styles.todoTitle}>To-dos</span>
              <span className={styles.todoCount}>{plan.length}</span>
            </div>
            <ul className={styles.todoList}>
              {planPreview.map((stepItem) => (
                <li key={stepItem.id} className={styles.todoItem}>
                  <span className={styles.todoIconWrap}>
                    <TodoDashedIcon />
                  </span>
                  <span className={styles.todoLabel}>{stepItem.title}</span>
                </li>
              ))}
            </ul>
            {hasPlanMore && (
              <>
                <div
                  className={`${styles.todoCollapsible}${
                    showPlanRest ? "" : ` ${styles.todoCollapsed}`
                  }`}
                >
                  <div className={styles.todoInner}>
                    <div className={styles.todoRest}>
                      <ul className={`${styles.todoList} ${styles.todoListFlush}`}>
                        {planRest.map((stepItem) => (
                          <li key={stepItem.id} className={styles.todoItem}>
                            <span className={styles.todoIconWrap}>
                              <TodoDashedIcon />
                            </span>
                            <span className={styles.todoLabel}>
                              {stepItem.title}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  className={styles.todoMore}
                  aria-expanded={planExpanded}
                  onClick={(e) => {
                    e.preventDefault();
                    setPlanExpanded((open) => !open);
                  }}
                >
                  <span className={styles.todoMoreIcon} aria-hidden>
                    <svg
                      className={styles.todoMoreGlyph}
                      viewBox="0 0 24 24"
                      aria-hidden
                    >
                      {planExpanded ? (
                        <rect
                          x="4.75"
                          y="11.25"
                          width="14.5"
                          height="1.5"
                          rx="0.75"
                          fill="currentColor"
                        />
                      ) : (
                        <>
                          <circle cx="6" cy="12" r="1.25" fill="currentColor" />
                          <circle cx="12" cy="12" r="1.25" fill="currentColor" />
                          <circle cx="18" cy="12" r="1.25" fill="currentColor" />
                        </>
                      )}
                    </svg>
                  </span>
                  {planExpanded ? "Show less" : `${planRest.length} more`}
                </button>
              </>
            )}
          </div>
        </>
      )}

      <div className={styles.actions}>
        {variant === "questions" ? (
          <div
            className={styles.stepNav}
            aria-label={`Question ${safeStep + 1} of ${questions.length}`}
          >
            <button
              type="button"
              className={styles.stepArrow}
              aria-label="Previous question"
              disabled={safeStep <= 0}
              onClick={(e) => {
                e.preventDefault();
                goToStep(safeStep - 1);
              }}
            >
              <ChevronUp
                className={styles.stepArrowIcon}
                strokeWidth={2}
                aria-hidden
              />
            </button>
            <span className={styles.stepBadge} aria-live="polite">
              <RollingDigits value={stepLabel} />
            </span>
            <button
              type="button"
              className={styles.stepArrow}
              aria-label="Next question"
              disabled={safeStep >= questions.length - 1}
              onClick={(e) => {
                e.preventDefault();
                goToStep(safeStep + 1);
              }}
            >
              <ChevronDown
                className={styles.stepArrowIcon}
                strokeWidth={2}
                aria-hidden
              />
            </button>
          </div>
        ) : variant === "plan" && autoUI !== "gone" ? (
          <div
            className={`${styles.autoApprove}${
              autoUI === "leaving" ? ` ${styles.autoApproveOut}` : ""
            }`}
            aria-live="polite"
            aria-label={`Auto approve in ${autoSecs} seconds`}
          >
            <span className={styles.autoApproveTip}>
            <button
              type="button"
              className={styles.autoApproveCancel}
              aria-label="Cancel auto approve"
              disabled={autoUI !== "active"}
              onClick={(e) => {
                e.preventDefault();
                cancelAutoApprove();
              }}
            >
              <svg
                className={styles.autoApprovePie}
                viewBox="0 0 24 24"
                width="16"
                height="16"
                aria-hidden
              >
                <circle
                  className={styles.autoApprovePieTrack}
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  strokeWidth="1.8"
                />
                <circle
                  className={styles.autoApprovePieFill}
                  cx="12"
                  cy="12"
                  r="9"
                  fill="none"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  pathLength={1}
                  strokeDasharray={1}
                  style={{
                    strokeDashoffset:
                      1 - (AUTO_APPROVE_SECS - autoSecs) / AUTO_APPROVE_SECS,
                  }}
                  transform="rotate(-90 12 12)"
                />
              </svg>
              <span className={styles.autoApproveCancelGlyph} aria-hidden>
                <X size={8} strokeWidth={2.5} />
              </span>
            </button>
            </span>
            <span className={styles.autoApproveLabel}>
              Auto Approve in{" "}
              <span className={styles.autoApproveSecs}>
                <RollingDigits value={String(autoSecs)} />
              </span>
              s
            </span>
          </div>
        ) : (
          <span className={styles.actionsSpacer} aria-hidden />
        )}
        <div className={styles.actionBtns}>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={(e) => {
              e.preventDefault();
              handleReject();
            }}
          >
            {resolvedReject}
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            disabled={!canContinue}
            onClick={(e) => {
              e.preventDefault();
              handleApprove();
            }}
          >
            {resolvedApprove}
            <CornerDownLeft
              className={styles.btnSubmitIcon}
              size={12}
              strokeWidth={2}
              aria-hidden
            />
          </button>
        </div>
      </div>
    </div>
  );
}
