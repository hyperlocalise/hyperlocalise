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
import { createHmac, timingSafeEqual } from "node:crypto";

import { err, ok, type Result } from "@/lib/primitives/result/results";

import type { LocalisationAuditError } from "./types";

const TOKEN_VERSION = 1;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 24 * 60 * 60;

export type PrivateReportAccessClaims = {
  auditId: string;
  reportId: string;
  expiresAt: Date;
};

type TokenPayload = {
  v: number;
  auditId: string;
  reportId: string;
  exp: number;
};

function signatureFor(encodedPayload: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(encodedPayload).digest();
}

export function mintPrivateReportAccessToken(input: {
  auditId: string;
  reportId: string;
  secret: string;
  now?: Date;
  lifetimeSeconds?: number;
}): string {
  const now = input.now ?? new Date();
  const payload: TokenPayload = {
    v: TOKEN_VERSION,
    auditId: input.auditId,
    reportId: input.reportId,
    exp:
      Math.floor(now.getTime() / 1000) + (input.lifetimeSeconds ?? DEFAULT_TOKEN_LIFETIME_SECONDS),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = signatureFor(encodedPayload, input.secret).toString("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyPrivateReportAccessToken(input: {
  token: string;
  secret: string;
  now?: Date;
}): Result<PrivateReportAccessClaims, LocalisationAuditError> {
  const [encodedPayload, encodedSignature, extra] = input.token.split(".");
  if (!encodedPayload || !encodedSignature || extra) {
    return err({
      code: "invalid_report_access_token",
      message: "The report access token is invalid.",
    });
  }

  let suppliedSignature: Buffer;
  let payload: TokenPayload;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
    payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8")) as TokenPayload;
  } catch {
    return err({
      code: "invalid_report_access_token",
      message: "The report access token is invalid.",
    });
  }

  const expectedSignature = signatureFor(encodedPayload, input.secret);
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    return err({
      code: "invalid_report_access_token",
      message: "The report access token is invalid.",
    });
  }

  const nowSeconds = Math.floor((input.now ?? new Date()).getTime() / 1000);
  if (
    payload.v !== TOKEN_VERSION ||
    typeof payload.auditId !== "string" ||
    typeof payload.reportId !== "string" ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= nowSeconds
  ) {
    return err({
      code: "invalid_report_access_token",
      message: "The report access token is invalid or expired.",
    });
  }

  return ok({
    auditId: payload.auditId,
    reportId: payload.reportId,
    expiresAt: new Date(payload.exp * 1000),
  });
}
