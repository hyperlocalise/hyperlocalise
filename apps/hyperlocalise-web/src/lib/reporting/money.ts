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
import type { MatchBucket } from "./word-analysis";

// Fixed-point USD at eight decimal places, including sub-cent model charges.
const SCALE = BigInt(100_000_000);
export function usdUnits(value: string): bigint {
  if (!/^\d+(\.\d{1,8})?$/.test(value)) throw new Error("invalid_usd_amount");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(8, "0"));
}
export function usdString(value: bigint): string {
  const sign = value < BigInt(0) ? "-" : "";
  const absolute = value < BigInt(0) ? -value : value;
  return `${sign}${absolute / SCALE}.${String(absolute % SCALE).padStart(8, "0")}`;
}
/**
 * The share of a match band a rate line pays, from its band percentages. The unavailable band
 * (the memory could not be read when the string arrived) is paid as new work. Spent and the
 * estimate both price by this one rule.
 */
export function paidPercent(
  percentages: Partial<Record<MatchBucket, number>> | null,
  bucket: MatchBucket,
): number {
  return percentages?.[bucket === "unavailable" ? "new" : bucket] ?? 100;
}

/** The cost of a number of units (words or characters) at a per-unit rate and payable share. */
export function unitCost(rate: string, units: number, payablePercent = 100): string {
  return usdString((usdUnits(rate) * BigInt(units) * BigInt(payablePercent)) / BigInt(100));
}
export function hourlyCost(rate: string, minutes: number): string {
  return usdString((usdUnits(rate) * BigInt(minutes) + BigInt(30)) / BigInt(60));
}
