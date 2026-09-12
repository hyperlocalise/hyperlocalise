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
const SENSITIVE_KEY = /(?:authorization|cookie|password|secret|token|api[-_]?key|credential)/i;
export function redactWorkflowSnapshot(value: unknown, secrets: readonly string[] = []): unknown {
  if (Array.isArray(value)) return value.map((entry) => redactWorkflowSnapshot(entry, secrets));
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        SENSITIVE_KEY.test(key) && !key.toLowerCase().endsWith("id")
          ? "[redacted]"
          : redactWorkflowSnapshot(entry, secrets),
      ]),
    );
  if (typeof value === "string") {
    let result = value;
    for (const secret of secrets) if (secret) result = result.split(secret).join("[redacted]");
    return result;
  }
  return value;
}

export function collectWorkflowSecrets(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(collectWorkflowSecrets);
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, entry]) =>
    SENSITIVE_KEY.test(key) && typeof entry === "string" && !key.toLowerCase().endsWith("id")
      ? [entry]
      : collectWorkflowSecrets(entry),
  );
}
