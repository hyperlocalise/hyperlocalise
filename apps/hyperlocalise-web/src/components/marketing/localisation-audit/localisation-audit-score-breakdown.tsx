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
import { motion, useInView, useReducedMotion } from "motion/react";
import { useRef } from "react";

import { scoreTone, type LocalisationAuditTone } from "@/lib/localisation-audit/score-tone";
import type { LocalisationAuditScoreComposition } from "@/lib/localisation-audit/score-composition";
import type { LocalisationAuditDimensionScores } from "@/lib/localisation-audit/types";
import { cn } from "@/lib/primitives/cn";

import { dimensionLabels, formatPoints } from "./localisation-audit-checks";
import type { LocalisationAuditResultCopy } from "./localisation-audit-page-content";
import { auditToneFillClass } from "./localisation-audit-tone";

const STEP_DELAY_SECONDS = 0.14;
const MIN_SHOWN_LOSS = 0.05;

type WaterfallRow = {
  key: string;
  label: string;
  value: string;
  /** Segment start and end on the 0–100 axis. */
  from: number;
  to: number;
  tone: LocalisationAuditTone | "base";
  emphasis?: boolean;
};

function WaterfallBar({
  row,
  index,
  inView,
}: {
  row: WaterfallRow;
  index: number;
  inView: boolean;
}) {
  const reduceMotion = useReducedMotion();
  const left = Math.min(row.from, row.to);
  const width = Math.abs(row.to - row.from);
  return (
    <span className="relative block h-3 rounded-full bg-muted/60">
      <motion.span
        className={cn(
          "absolute inset-y-0 origin-left rounded-full rtl:origin-right",
          row.tone === "base" ? "bg-foreground/80" : auditToneFillClass(row.tone),
        )}
        style={{ insetInlineStart: `${left}%`, width: `${Math.max(width, 0.6)}%` }}
        initial={{ scaleX: reduceMotion ? 1 : 0 }}
        animate={{ scaleX: inView || reduceMotion ? 1 : 0 }}
        transition={{
          duration: reduceMotion ? 0 : 0.6,
          delay: reduceMotion ? 0 : index * STEP_DELAY_SECONDS,
          ease: [0.22, 1, 0.36, 1],
        }}
      />
    </span>
  );
}

export function LocalisationAuditScoreBreakdown({
  composition,
  dimensionScores,
  copy,
  locale,
}: {
  composition: LocalisationAuditScoreComposition;
  dimensionScores: LocalisationAuditDimensionScores | undefined;
  copy: LocalisationAuditResultCopy;
  locale: string;
}) {
  const ref = useRef<HTMLOListElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const labels = dimensionLabels(copy);

  const rows: WaterfallRow[] = [
    {
      key: "start",
      label: copy.breakdownStart,
      value: "100",
      from: 0,
      to: 100,
      tone: "base",
    },
  ];

  let remaining = 100;
  for (const dimension of composition.dimensions) {
    if (dimension.pointsLost < MIN_SHOWN_LOSS) continue;
    rows.push({
      key: dimension.dimension,
      label: copy.breakdownLost({ dimension: labels[dimension.dimension] }),
      value: `−${formatPoints(dimension.pointsLost, locale)}`,
      from: remaining - dimension.pointsLost,
      to: remaining,
      tone: scoreTone(dimensionScores?.[dimension.dimension] ?? null),
    });
    remaining -= dimension.pointsLost;
  }

  rows.push({
    key: "base",
    label: copy.breakdownWeighted({ count: composition.scoredChecks }),
    value: formatPoints(composition.baseScore, locale),
    from: 0,
    to: composition.baseScore,
    tone: "base",
  });

  if (composition.coveragePenalty >= MIN_SHOWN_LOSS) {
    rows.push({
      key: "coverage",
      label: copy.breakdownCoverage({
        factor: new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(
          composition.coverageFactor,
        ),
      }),
      value: `−${formatPoints(composition.coveragePenalty, locale)}`,
      from: composition.baseScore - composition.coveragePenalty,
      to: composition.baseScore,
      tone: "watch",
    });
  }

  rows.push({
    key: "final",
    label: copy.breakdownFinal,
    value: String(composition.finalScore),
    from: 0,
    to: composition.finalScore,
    tone: scoreTone(composition.finalScore),
    emphasis: true,
  });

  return (
    <ol ref={ref} className="space-y-3">
      {rows.map((row, index) => (
        <li
          key={row.key}
          className={cn(
            "grid grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)_3.5rem]",
            row.emphasis && "border-t border-border pt-3",
          )}
        >
          <span
            className={cn(
              "text-sm text-pretty",
              row.emphasis ? "font-medium" : "text-muted-foreground",
            )}
          >
            {row.label}
          </span>
          <span className="col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto">
            <WaterfallBar row={row} index={index} inView={inView} />
          </span>
          <span
            className={cn(
              "col-start-2 row-start-1 text-end tabular-nums sm:col-start-auto sm:row-start-auto",
              row.emphasis ? "font-serif text-2xl" : "text-sm font-medium",
            )}
          >
            {row.value}
          </span>
        </li>
      ))}
    </ol>
  );
}
