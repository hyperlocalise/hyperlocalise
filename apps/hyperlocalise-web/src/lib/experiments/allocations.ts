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

export const EXPERIMENT_BUCKET_COUNT = 10000;

export type ExperimentAllocationRange = {
  start: number;
  end: number;
};

export function calculateAllocationRanges(
  experimentRolloutPercentage: number,
  variantRolloutPercentages: number[],
  bucketCount = EXPERIMENT_BUCKET_COUNT,
): Array<ExperimentAllocationRange | null> {
  const normalizedExperimentPercentage = Math.max(0, Math.min(experimentRolloutPercentage, 10000));
  const allocatedBuckets = Math.floor((normalizedExperimentPercentage / 10000) * bucketCount);
  const ranges: Array<ExperimentAllocationRange | null> = [];
  let start = 0;

  for (const [index, variantPercentage] of variantRolloutPercentages.entries()) {
    if (!variantPercentage) {
      ranges.push(null);
      continue;
    }

    const normalizedVariantPercentage = Math.max(0, Math.min(variantPercentage, 10000));
    const variantBuckets = Math.floor((normalizedVariantPercentage / 10000) * allocatedBuckets);
    const remainingBuckets = Math.max(allocatedBuckets - start, 0);
    const adjustedVariantBuckets =
      index === variantRolloutPercentages.length - 1
        ? remainingBuckets
        : Math.min(variantBuckets, remainingBuckets);
    const end = start + adjustedVariantBuckets - 1;

    if (end >= start) {
      ranges.push({ start, end });
      start = end + 1;
    } else {
      ranges.push(null);
    }
  }

  return ranges;
}

export function generateExperimentSeed(): number {
  return Math.floor(Math.random() * 2 ** 32) - 2147483648;
}
