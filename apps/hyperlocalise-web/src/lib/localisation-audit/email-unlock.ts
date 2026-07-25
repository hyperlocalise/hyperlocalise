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
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

import { LOCALISATION_AUDIT_REPORT_TOKEN_TTL_MS } from "./types";

/** Legacy single-cookie name kept for migration reads; prefer per-domain cookies. */
export const LOCALISATION_AUDIT_UNLOCK_COOKIE = "hl_localisation_audit_unlock";

export function localisationAuditUnlockCookieName(domainSlug: string): string {
  return `hl_la_unlock_${domainSlug}`;
}

function unlockSecret(): string {
  return (
    env.WORKOS_COOKIE_PASSWORD ??
    env.PROVIDER_CREDENTIALS_MASTER_KEY ??
    "localisation-audit-dev-secret-min-32-chars"
  );
}

export function signLocalisationAuditUnlock(input: { domainSlug: string; email: string }): string {
  const email = input.email.trim().toLowerCase();
  const payload = `${input.domainSlug}:${email}`;
  const signature = createHmac("sha256", unlockSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${signature}`, "utf8").toString("base64url");
}

export function verifyLocalisationAuditUnlock(
  token: string | undefined,
  domainSlug: string,
): { email: string } | null {
  if (!token) return null;
  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const parts = decoded.split(":");
    if (parts.length < 3) return null;
    const signature = parts.at(-1)!;
    const email = parts.at(-2)!;
    const slug = parts.slice(0, -2).join(":");
    if (slug !== domainSlug) return null;

    const expected = createHmac("sha256", unlockSecret())
      .update(`${slug}:${email}`)
      .digest("base64url");
    const left = Buffer.from(signature);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) {
      return null;
    }
    return { email };
  } catch {
    return null;
  }
}

export function hashLocalisationAuditReportToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function mintLocalisationAuditReportToken(): {
  token: string;
  tokenHash: string;
  expiresAt: Date;
} {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    tokenHash: hashLocalisationAuditReportToken(token),
    expiresAt: new Date(Date.now() + LOCALISATION_AUDIT_REPORT_TOKEN_TTL_MS),
  };
}

export function buildLocalisationAuditVerifyUrl(input: {
  domainSlug: string;
  token: string;
  locale: string;
}): string {
  const base = env.HYPERLOCALISE_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "http://localhost:3000";
  const url = new URL(`/api/localisation-audit/${input.domainSlug}/verify`, base);
  url.searchParams.set("token", input.token);
  url.searchParams.set("locale", input.locale);
  return url.toString();
}
