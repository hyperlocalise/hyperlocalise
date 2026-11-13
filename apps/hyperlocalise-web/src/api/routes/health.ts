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
import { GetCallerIdentityCommand, STSClient } from "@aws-sdk/client-sts";
import { Hono } from "hono";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";

import { isDatabaseHealthy } from "@/lib/database/client";
import { env } from "@/lib/env";

const AWS_OIDC_HEALTH_TIMEOUT_MS = 1_000;

async function getOidcHealth() {
  const isVercelRuntime = process.env.VERCEL === "1";
  const roleArn = env.AWS_ROLE_ARN;
  const shouldCheckAws =
    process.env.NODE_ENV === "production" &&
    isVercelRuntime &&
    process.env.VERCEL_ENV === "production";

  if (!shouldCheckAws) {
    return {
      configured: false,
      provider: isVercelRuntime ? "vercel_oidc" : "default_credentials",
      status: "not_checked",
    } as const;
  }

  if (!roleArn) {
    return {
      configured: false,
      provider: "vercel_oidc",
      status: "not_configured",
    } as const;
  }

  const stsClient = new STSClient({
    region: env.AWS_REGION,
    credentials: awsCredentialsProvider({
      audience: "sts.amazonaws.com",
      roleArn,
    }),
  });

  try {
    await stsClient.send(new GetCallerIdentityCommand({}), {
      abortSignal: AbortSignal.timeout(AWS_OIDC_HEALTH_TIMEOUT_MS),
    });
  } catch {
    return {
      configured: true,
      provider: "vercel_oidc",
      status: "unavailable",
    } as const;
  }

  return {
    configured: true,
    provider: "vercel_oidc",
    status: "ok",
  } as const;
}

export const healthRoutes = new Hono().get("/", async (c) => {
  const [isDatabaseHealthyResult, oidc] = await Promise.all([isDatabaseHealthy(), getOidcHealth()]);

  if (!isDatabaseHealthyResult) {
    return c.json(
      {
        ok: false,
        error: "database_unavailable",
        checks: {
          database: false,
          oidc,
        },
      },
      503,
    );
  }

  if (oidc.status === "not_configured" || oidc.status === "unavailable") {
    return c.json(
      {
        ok: false,
        error: "aws_oidc_unavailable",
        checks: {
          database: true,
          oidc,
        },
      },
      503,
    );
  }

  return c.json({
    ok: true,
    checks: {
      database: true,
      oidc,
    },
  });
});
