"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
} from "react";
import { motion, useAnimationControls } from "motion/react";
import { CheckIcon, UploadSimpleIcon } from "@phosphor-icons/react";
import { FormattedMessage, useIntl, type IntlShape } from "react-intl";

import { cn } from "@/lib/primitives/cn";
import { uploadDropzoneMessages as messages } from "./upload-dropzone.messages";

/* Reduced motion is read once on mount, not subscribed. */
const stillness = () =>
  typeof window !== "undefined" &&
  !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

const MAX = 5;

type F = { id: string; name: string; ext: string; size: number; tint: string };

const formatBytes = (intl: IntlShape, bytes: number) =>
  bytes >= 1e6
    ? intl.formatMessage(messages.sizeMb, { size: (bytes / 1e6).toFixed(1) })
    : intl.formatMessage(messages.sizeKb, { size: Math.round(bytes / 1e3) });
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

function isAcceptedType(file: File, accept: string) {
  return accept.split(",").some((part) => {
    const token = part.trim().toLowerCase();
    if (token.startsWith(".")) {
      return file.name.toLowerCase().endsWith(token);
    }
    return file.type.toLowerCase() === token;
  });
}

function toFileTile(file: File): F {
  const ext = (file.name.split(".").pop() ?? "FILE").toUpperCase().slice(0, 4);
  const tint = ext === "PNG" ? "#079455" : ext === "JPG" || ext === "JPEG" ? "#155EEF" : "#7C3AED";
  return {
    id: `${file.name}:${file.size}:${file.lastModified}`,
    name: file.name,
    ext,
    size: file.size,
    tint,
  };
}

/* File glyph: folded page on a 40 grid, extension on a coloured
   label. fontSize lives on the <text> so it scales with the icon. */
function Page({ f, size = 40 }: { f: F; size?: number }) {
  return (
    <svg
      className="upl-page"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        className="upl-page-line"
        d="M7.75 4A3.25 3.25 0 0 1 11 .75h16c.121 0 .238.048.323.134l10.793 10.793a.46.46 0 0 1 .134.323v24A3.25 3.25 0 0 1 35 39.25H11A3.25 3.25 0 0 1 7.75 36z"
      />
      <path className="upl-page-line" d="M27 .5V8a4 4 0 0 0 4 4h7.5" />
      <rect width="29" height="16" x="1" y="18" rx="8" fill={f.tint} />
      <text x="15.5" y="29.1" textAnchor="middle" fontSize="9" className="upl-page-ext">
        {f.ext}
      </text>
    </svg>
  );
}

function Roll({ value }: { value: number }) {
  const intl = useIntl();
  const s = String(Math.round(value));
  return (
    <span
      className="upl-roll"
      aria-label={intl.formatNumber(value / 100, { style: "percent", maximumFractionDigits: 0 })}
    >
      {s.split("").map((d, i) => (
        <span key={s.length - i} className="upl-roll-col">
          <span className="upl-roll-strip" style={{ transform: `translateY(${-Number(d)}em)` }}>
            {"0123456789".split("").map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      ))}
      <FormattedMessage {...messages.percentMark} />
    </span>
  );
}

type Phase = { kind: "idle" } | { kind: "up"; f: F; p: number } | { kind: "done"; f: F };

export type UploadDropzoneProps = {
  /* progress climb, 0..100 */
  speed?: number;
  /* land-spring overshoot, 0..100 */
  bounce?: number;
  corner?: number;
  accept?: string;
  maxMb?: number;
  disabled?: boolean;
  compact?: boolean;
  wide?: boolean;
  idleTitle?: string;
  dropTitle?: string;
  hint?: string;
  tooBigTitle?: string;
  invalidTitle?: string;
  failedTitle?: string;
  onUpload?: (file: File) => void | Promise<void>;
  className?: string;
};

export function UploadDropzone({
  speed = 50,
  bounce = 40,
  corner = 20,
  accept,
  maxMb = MAX,
  disabled = false,
  compact = false,
  wide = false,
  idleTitle,
  dropTitle,
  hint,
  tooBigTitle,
  invalidTitle,
  failedTitle,
  onUpload,
  className,
}: UploadDropzoneProps) {
  const intl = useIntl();
  const still = stillness();
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const [refuse, setRefuse] = useState<string | null>(null);
  const [gulp, setGulp] = useState(false);
  const zone = useRef<HTMLDivElement>(null);
  const now = useRef<HTMLSpanElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const shake = useAnimationControls();
  const raf = useRef(0);
  const timers = useRef<number[]>([]);
  const knobs = useRef({ speed });
  knobs.current = { speed };

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      timers.current.forEach(clearTimeout);
    },
    [],
  );
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  /* Progress climbs while `onUpload` runs. Uneven steps so it does
     not read as a timer. Hold at 96% if the request is still in flight. */
  const send = (f: F, file: File) => {
    setPhase({ kind: "up", f, p: 0 });
    if (still) {
      if (!onUpload) {
        finish(f);
        return;
      }
      void Promise.resolve(onUpload(file))
        .then(() => finish(f))
        .catch(() => fail(failedTitle ?? intl.formatMessage(messages.failed)));
      return;
    }
    let p = 0;
    let prev = 0;
    let uploadDone = !onUpload;
    let uploadError: unknown;
    if (onUpload) {
      void Promise.resolve(onUpload(file))
        .then(() => {
          uploadDone = true;
        })
        .catch((error: unknown) => {
          uploadError = error;
        });
    }
    const secs =
      (4 - (clamp(knobs.current.speed, 0, 100) / 100) * 3.2) *
      (0.7 + Math.min(1, f.size / 5e6) * 0.6);
    const tick = (t: number) => {
      const dt = prev ? Math.min(0.05, (t - prev) / 1000) : 0;
      prev = t;
      if (uploadError) {
        raf.current = 0;
        fail(failedTitle ?? intl.formatMessage(messages.failed));
        return;
      }
      p = Math.min(1, p + (dt / secs) * (0.4 + Math.random() * 1.2));
      if (uploadDone && p >= 0.16) {
        raf.current = 0;
        finish(f);
        return;
      }
      if (p >= 1) {
        if (uploadDone) {
          raf.current = 0;
          finish(f);
          return;
        }
        p = 0.96;
      }
      setPhase({ kind: "up", f, p });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
  };

  const finish = (f: F) => {
    setPhase({ kind: "done", f });
    later(() => {
      setPhase({ kind: "idle" });
    }, 1500);
  };

  const fail = (message: string) => {
    setPhase({ kind: "idle" });
    setRefuse(message);
    void shake.start({ x: [0, -7, 6, -4, 2, 0], transition: { duration: 0.42 } });
    later(() => setRefuse(null), 1800);
  };

  const refuseIt = (reason: "big" | "type" = "big") => {
    fail(
      reason === "type"
        ? (invalidTitle ?? intl.formatMessage(messages.invalidType))
        : (tooBigTitle ?? intl.formatMessage(messages.tooBig, { limit: maxMb })),
    );
  };

  const receive = (file: File) => {
    if (phase.kind !== "idle" || disabled) {
      return;
    }
    if (accept && !isAcceptedType(file, accept)) {
      refuseIt("type");
      return;
    }
    if (file.size > maxMb * 1e6) {
      refuseIt("big");
      return;
    }
    const f = toFileTile(file);
    if (!still) {
      setGulp(true);
      later(() => setGulp(false), 460);
    }
    send(f, file);
  };

  /* Size the box to the upload row (width/height, not scale) so
     the corner radius stays true. The wrap stays 176px so the
     layout below does not jump. */
  useLayoutEffect(() => {
    const z = zone.current;
    const n = now.current;
    if (!z) return;
    if (phase.kind === "idle" || !n) {
      z.style.width = "";
      z.style.height = "";
      return;
    }
    z.style.width = `${n.offsetWidth + 32}px`;
    z.style.height = `${n.offsetHeight + 28}px`;
  }, [phase.kind]);

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || phase.kind !== "idle") {
      return;
    }
    e.preventDefault();
    if (!over) {
      setOver(true);
    }
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!zone.current?.contains(e.relatedTarget as Node | null)) {
      setOver(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      receive(file);
    }
  };

  const r = Math.max(0, corner);
  const up = phase.kind !== "idle";
  const f = phase.kind !== "idle" ? phase.f : null;
  const idleLabel =
    refuse ??
    (over
      ? (dropTitle ?? intl.formatMessage(messages.drop))
      : (idleTitle ?? intl.formatMessage(messages.idle)));
  const hintLabel = hint ?? intl.formatMessage(messages.hint, { limit: maxMb });

  return (
    <div
      className={cn("upl", className)}
      data-wide={wide || undefined}
      data-compact={compact || undefined}
      style={
        {
          "--upl-r": `${r}px`,
          "--upl-spring": `cubic-bezier(0.3, ${1 + (bounce / 100) * 0.9}, 0.4, 1)`,
        } as CSSProperties
      }
    >
      <motion.div animate={shake} className="upl-zone-wrap">
        <div
          ref={zone}
          className="upl-zone"
          data-over={over || undefined}
          data-refuse={refuse ? true : undefined}
          data-busy={up || undefined}
          data-gulp={gulp || undefined}
          aria-label={idleLabel}
          aria-live="polite"
          role="button"
          tabIndex={disabled || up ? undefined : 0}
          onClick={() => {
            if (disabled || up) {
              return;
            }
            input.current?.click();
          }}
          onKeyDown={(e) => {
            if (disabled || up) {
              return;
            }
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              input.current?.click();
            }
          }}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {!f ? (
            <>
              <span className="upl-icon">
                <UploadSimpleIcon size={18} weight="regular" />
              </span>
              <span className="upl-say">
                <b>{idleLabel}</b>
                <span>{hintLabel}</span>
              </span>
            </>
          ) : (
            <span className="upl-now" key={f.id} ref={now}>
              <Page f={f} size={36} />
              <span className="upl-text">
                <span className="upl-name">{f.name}</span>
                <span className="upl-meta">
                  <FormattedMessage
                    {...messages.meta}
                    values={{
                      size: formatBytes(intl, f.size),
                      status:
                        phase.kind === "done" ? (
                          intl.formatMessage(messages.uploaded)
                        ) : (
                          <Roll value={phase.kind === "up" ? phase.p * 100 : 0} />
                        ),
                    }}
                  />
                </span>
                <span className="upl-track">
                  <span
                    className="upl-bar"
                    style={{ transform: `scaleX(${phase.kind === "up" ? phase.p : 1})` }}
                  />
                </span>
              </span>
              <span className="upl-end">
                {phase.kind === "done" && (
                  <span className="upl-tick">
                    <CheckIcon size={14} weight="regular" />
                  </span>
                )}
              </span>
            </span>
          )}
        </div>
      </motion.div>

      <input
        ref={input}
        type="file"
        accept={accept}
        className="sr-only"
        disabled={disabled || up}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.currentTarget.value = "";
          if (file) {
            receive(file);
          }
        }}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
