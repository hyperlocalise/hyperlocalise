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
/** The cost of a number of units (words or characters) at a per-unit rate and payable share. */
export function unitCost(rate: string, units: number, payablePercent = 100): string {
  return usdString((usdUnits(rate) * BigInt(units) * BigInt(payablePercent)) / BigInt(100));
}
export function hourlyCost(rate: string, minutes: number): string {
  return usdString((usdUnits(rate) * BigInt(minutes) + BigInt(30)) / BigInt(60));
}
export function budgetWarning(budget: string, cost: string): "none" | "approaching" | "exceeded" {
  const limit = usdUnits(budget),
    accrued = usdUnits(cost);
  if (accrued >= limit) return "exceeded";
  return accrued * BigInt(100) >= limit * BigInt(80) ? "approaching" : "none";
}
