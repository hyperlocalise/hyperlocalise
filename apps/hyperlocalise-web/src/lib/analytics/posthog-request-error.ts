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
import { posthogProjectToken } from "./posthog-config";
import { capturePostHogServerException, type PostHogServerTrackOptions } from "./posthog-server";

export type PostHogRequestErrorContext = {
  routerKind?: string;
  routePath?: string;
  routeType?: string;
};

export type PostHogRequestErrorRequest = {
  path?: string;
  method?: string;
  headers?: { [key: string]: string | string[] | undefined };
};

export type CapturePostHogServerRequestErrorOptions = PostHogServerTrackOptions & {
  runtime?: string;
};

const NEXT_CONTROL_FLOW_MESSAGE_PREFIX = "NEXT_";

export function posthogDistinctIdFromCookieHeader(
  cookieHeader: string | undefined,
  projectToken: string,
): string | undefined {
  if (!cookieHeader || !projectToken) {
    return undefined;
  }

  const cookieName = `ph_${projectToken}_posthog=`;
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(cookieName)) {
      continue;
    }

    try {
      const parsed = JSON.parse(decodeURIComponent(trimmed.slice(cookieName.length))) as {
        distinct_id?: unknown;
      };
      if (typeof parsed.distinct_id === "string") {
        const distinctId = parsed.distinct_id.trim();
        if (distinctId) {
          return distinctId;
        }
      }
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function cookieHeaderFromRequest(request: PostHogRequestErrorRequest): string | undefined {
  const cookie = request.headers?.cookie ?? request.headers?.Cookie;
  if (Array.isArray(cookie)) {
    return cookie.join("; ");
  }
  return cookie;
}

function isNextControlFlowError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith(NEXT_CONTROL_FLOW_MESSAGE_PREFIX);
}

function digestFromError(error: unknown): string | undefined {
  if (!error || typeof error !== "object" || !("digest" in error)) {
    return undefined;
  }
  const digest = error.digest;
  return typeof digest === "string" && digest.trim() ? digest : undefined;
}

/**
 * Capture a Next.js `onRequestError` exception. Skips the Edge runtime (no
 * process listeners / Node SDK) and Next.js control-flow throws. Does not
 * attach the request path, query, or headers.
 */
export async function capturePostHogServerRequestError(
  error: unknown,
  request: PostHogRequestErrorRequest,
  context: PostHogRequestErrorContext,
  options?: CapturePostHogServerRequestErrorOptions,
): Promise<void> {
  const runtime = options?.runtime ?? process.env.NEXT_RUNTIME;
  if (runtime === "edge" || isNextControlFlowError(error)) {
    return;
  }

  const projectToken = options?.projectToken ?? posthogProjectToken();
  const cookieDistinctId = projectToken
    ? posthogDistinctIdFromCookieHeader(cookieHeaderFromRequest(request), projectToken)
    : undefined;
  const digest = digestFromError(error);
  const routeType = context.routeType?.trim();

  await capturePostHogServerException(
    error,
    {
      source: "server_request",
      ...(routeType ? { feature: routeType } : {}),
      ...(digest ? { digest } : {}),
    },
    {
      ...options,
      distinctId: options?.distinctId ?? cookieDistinctId,
      // Do not resolve WorkOS here: auth failures can be the error being reported.
      resolveSession: options?.resolveSession ?? (async () => null),
    },
  );
}

export async function onRequestError(
  error: unknown,
  request: PostHogRequestErrorRequest,
  context: PostHogRequestErrorContext,
): Promise<void> {
  await capturePostHogServerRequestError(error, request, context);
}
