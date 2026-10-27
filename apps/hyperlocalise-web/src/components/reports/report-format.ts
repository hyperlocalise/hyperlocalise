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
"use client";

import type { IntlShape } from "react-intl";

import type { ReportChange } from "@/lib/reporting/report-period";
import type { ReportStep, ReportUnit } from "@/lib/reporting/report-units";
import type { MatchBucket } from "@/lib/reporting/word-analysis";

import { reportsPageMessages as messages } from "./reports-page.messages";

/** Formatting shared by the Reports page's sections. */

export function formatCount(intl: IntlShape, value: number) {
  return intl.formatNumber(Math.round(value));
}

/** Token counts, shortened: 43.7M. */
export function formatCompact(intl: IntlShape, value: number) {
  return intl.formatNumber(value, { notation: "compact", maximumFractionDigits: 1 });
}

/** A fixed-point USD amount from the API, such as "1234.50000000". */
export function formatUsd(intl: IntlShape, value: string | null) {
  if (value === null) return "—";
  return intl.formatNumber(Number(value), { style: "currency", currency: "USD" });
}

/** A rate with every decimal it was set with, since per-character rates are often tiny. */
export function formatRateAmount(intl: IntlShape, value: string) {
  return intl.formatNumber(Number(value), {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

/** A share as a whole percentage, never rounded up to 100% or down to 0% when it is neither. */
export function formatShare(intl: IntlShape, share: number | null) {
  if (share === null) return "—";
  if (share > 0 && share < 0.005) return intl.formatMessage(messages.belowOnePercent);
  if (share >= 0.995 && share < 1) return intl.formatMessage(messages.aboveNinetyNinePercent);
  return intl.formatNumber(share, { style: "percent", maximumFractionDigits: 0 });
}

export function formatDuration(intl: IntlShape, minutes: number) {
  const whole = Math.round(minutes);
  return intl.formatMessage(messages.duration, {
    hours: intl.formatNumber(Math.floor(whole / 60)),
    minutes: String(whole % 60).padStart(2, "0"),
  });
}

/**
 * How a headline number changed against the previous period, in a neutral sentence. When the
 * previous value was 0 the change is the plain difference, written with `formatValue` so it is
 * in the card's own unit (hours, dollars); a count by default. Nothing, when Reports was not yet
 * recording the whole previous period: the card then shows no comparison at all, as Stripe's
 * dashboards do, rather than a line about missing data.
 */
export function formatChange(
  intl: IntlShape,
  change: ReportChange,
  days: number,
  formatValue: (value: number) => string = (value) => intl.formatNumber(Math.round(value)),
) {
  const previous = intl.formatMessage(messages.previousPeriod, { days });
  switch (change.kind) {
    case "no_earlier_data":
      return undefined;
    case "unavailable":
      return intl.formatMessage(messages.changeUnavailable);
    case "points":
      return intl.formatMessage(messages.changePoints, {
        change: intl.formatNumber(change.value, { signDisplay: "exceptZero" }),
        count: Math.abs(change.value),
        previous,
      });
    case "percent":
      return intl.formatMessage(messages.changeAgainstPrevious, {
        change: intl.formatNumber(change.value / 100, {
          style: "percent",
          signDisplay: "exceptZero",
        }),
        previous,
      });
    case "difference":
      return intl.formatMessage(messages.changeAgainstPrevious, {
        change: `${change.value > 0 ? "+" : change.value < 0 ? "-" : ""}${formatValue(Math.abs(change.value))}`,
        previous,
      });
  }
}

const UNIT_MESSAGES = {
  words: messages.unitWords,
  strings: messages.unitStrings,
  characters: messages.unitCharacters,
  characters_with_spaces: messages.unitCharactersWithSpaces,
} as const satisfies Record<ReportUnit, unknown>;

export function unitLabel(intl: IntlShape, unit: ReportUnit) {
  return intl.formatMessage(UNIT_MESSAGES[unit]);
}

const BAND_MESSAGES = {
  repetition: messages.band_repetition,
  "100": messages.band_100,
  "95-99": messages["band_95-99"],
  "85-94": messages["band_85-94"],
  "75-84": messages["band_75-84"],
  "50-74": messages["band_50-74"],
  new: messages.band_new,
  unavailable: messages.band_unavailable,
} as const satisfies Record<MatchBucket, unknown>;

export function bandLabel(intl: IntlShape, bucket: MatchBucket) {
  return intl.formatMessage(BAND_MESSAGES[bucket]);
}

export function stepLabel(intl: IntlShape, step: ReportStep) {
  return intl.formatMessage(
    step === "translation" ? messages.stepTranslation : messages.stepReview,
  );
}
