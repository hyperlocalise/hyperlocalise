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
import { randomUUID } from "node:crypto";
import { PostHog } from "posthog-node";

import { posthogIngestHost, posthogProjectToken } from "./posthog-config";

export type PostHogServerSession = {
  user?: { id?: string | null } | null;
};

export type PostHogServerCaptureInput = {
  distinctId: string;
  event: string;
  properties?: Record<string, string | number | boolean>;
};

export type PostHogServerTrackOptions = {
  projectToken?: string;
  host?: string;
  distinctId?: string;
  captureFn?: (event: PostHogServerCaptureInput) => void | Promise<void>;
  resolveSession?: () => Promise<PostHogServerSession | null | undefined>;
};

let posthogClient: PostHog | null = null;
let posthogClientToken: string | undefined;

function posthogServerClient(projectToken: string, host: string): PostHog {
  if (!posthogClient || posthogClientToken !== projectToken) {
    void posthogClient?.shutdown();
    posthogClient = new PostHog(projectToken, {
      host,
      flushAt: 1,
      flushInterval: 0,
    });
    posthogClientToken = projectToken;
  }

  return posthogClient;
}

async function resolveWorkosSession(): Promise<PostHogServerSession | null> {
  try {
    const { withAuth } = await import("@/lib/workos/server-auth");
    return await withAuth();
  } catch {
    return null;
  }
}

/**
 * Fire-and-forget PostHog capture. No-ops without a project token.
 * Uses the WorkOS user id when a request session exists so server events join
 * the same person as `posthog.identify(user.id)` in the browser.
 */
export async function trackPostHogServerEvent(
  name: string,
  properties?: Record<string, string | number | boolean>,
  options?: PostHogServerTrackOptions,
): Promise<void> {
  const projectToken = options?.projectToken ?? posthogProjectToken();
  if (!projectToken) {
    return;
  }

  try {
    const session = options?.distinctId
      ? null
      : await (options?.resolveSession ?? resolveWorkosSession)();
    const sessionUserId = session?.user?.id?.trim();
    const identified = Boolean(options?.distinctId || sessionUserId);
    const distinctId = options?.distinctId ?? sessionUserId ?? randomUUID();

    const event: PostHogServerCaptureInput = {
      distinctId,
      event: name,
      properties: {
        ...properties,
        ...(identified ? {} : { $process_person_profile: false }),
      },
    };

    if (options?.captureFn) {
      await options.captureFn(event);
      return;
    }

    posthogServerClient(projectToken, options?.host ?? posthogIngestHost()).capture(event);
  } catch {
    // Analytics must not break the product path.
  }
}
