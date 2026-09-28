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
import type { VisualMergeMode } from "../schema/types";

export type MergeInputSettlement = "succeeded" | "failed" | "skipped";

export type MergeDecision =
  | {
      state: "pending";
    }
  | {
      state: "completed";
      selectedInputId: string;
      arrivedInputIds: string[];
    }
  | {
      state: "skipped";
    }
  | {
      state: "failed";
      code: "merge_no_successful_input";
    };

export function decideMerge(input: {
  mode: VisualMergeMode;
  inputIds: readonly string[];
  settlements: ReadonlyMap<string, MergeInputSettlement>;
}): MergeDecision {
  const { mode, inputIds, settlements } = input;

  const settledInputIds = inputIds.filter((inputId) => settlements.has(inputId));

  const succeededInputIds = inputIds.filter((inputId) => settlements.get(inputId) === "succeeded");

  const arrivedInputIds = inputIds.filter((inputId) => {
    const settlement = settlements.get(inputId);

    return settlement === "succeeded" || settlement === "failed";
  });

  const allSettled = settledInputIds.length === inputIds.length;

  if (mode === "all") {
    if (!allSettled) {
      return { state: "pending" };
    }

    if (arrivedInputIds.length === 0) {
      return { state: "skipped" };
    }

    return {
      state: "completed",
      selectedInputId: arrivedInputIds[0]!,
      arrivedInputIds,
    };
  }

  if (mode === "any") {
    if (arrivedInputIds.length > 0) {
      return {
        state: "completed",
        selectedInputId: arrivedInputIds[0]!,
        arrivedInputIds,
      };
    }

    return allSettled ? { state: "skipped" } : { state: "pending" };
  }

  if (succeededInputIds.length > 0) {
    return {
      state: "completed",
      selectedInputId: succeededInputIds[0]!,
      arrivedInputIds: succeededInputIds,
    };
  }

  if (!allSettled) {
    return { state: "pending" };
  }

  if (arrivedInputIds.length === 0) {
    return { state: "skipped" };
  }

  return {
    state: "failed",
    code: "merge_no_successful_input",
  };
}
