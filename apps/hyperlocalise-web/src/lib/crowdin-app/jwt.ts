/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import jwt from "jsonwebtoken";

import { env } from "@/lib/env";

export type CrowdinAppJwtPayload = {
  aud?: string;
  sub?: string;
  domain?: string | null;
  context?: {
    organization_id?: number | string;
    user_id?: number | string;
    project_id?: number | string;
    project?: {
      id?: number | string;
    };
  };
  iat?: number;
  exp?: number;
};

export type VerifiedCrowdinAppJwt = {
  crowdinOrganizationId: number;
  crowdinUserId: number;
  crowdinProjectId: number;
  domain: string | null;
};

function parsePositiveInt(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    return parsed > 0 ? parsed : null;
  }
  return null;
}

export function extractCrowdinAppJwtClaims(
  payload: CrowdinAppJwtPayload,
): VerifiedCrowdinAppJwt | { error: string } {
  const crowdinUserId = parsePositiveInt(payload.context?.user_id) ?? parsePositiveInt(payload.sub);
  const crowdinOrganizationId = parsePositiveInt(payload.context?.organization_id);
  const crowdinProjectId =
    parsePositiveInt(payload.context?.project_id) ?? parsePositiveInt(payload.context?.project?.id);

  if (!crowdinUserId) {
    return { error: "crowdin_jwt_missing_user_id" };
  }
  if (!crowdinOrganizationId) {
    return { error: "crowdin_jwt_missing_organization_id" };
  }
  if (!crowdinProjectId) {
    return { error: "crowdin_jwt_missing_project_id" };
  }

  return {
    crowdinUserId,
    crowdinOrganizationId,
    crowdinProjectId,
    domain: payload.domain ?? null,
  };
}

export function verifyCrowdinAppJwt(token: string): VerifiedCrowdinAppJwt | { error: string } {
  const clientId = env.CROWDIN_APP_CLIENT_ID;
  const clientSecret = env.CROWDIN_APP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { error: "crowdin_app_not_configured" };
  }

  try {
    const payload = jwt.verify(token, clientSecret, {
      algorithms: ["HS256"],
      audience: clientId,
    }) as CrowdinAppJwtPayload;
    return extractCrowdinAppJwtClaims(payload);
  } catch {
    return { error: "crowdin_jwt_invalid" };
  }
}
