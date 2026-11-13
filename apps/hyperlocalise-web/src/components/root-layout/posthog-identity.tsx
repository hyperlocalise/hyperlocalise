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
"use client";

import { useEffect, useRef } from "react";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { useParams } from "next/navigation";
import posthog from "posthog-js";

/**
 * Identify the WorkOS user and group by organization slug.
 * Resets on sign-out so the next browser session is not inherited.
 */
export function PostHogIdentity() {
  const { user } = useAuth();
  const params = useParams<{ organizationSlug?: string | string[] }>();
  const identifiedUserIdRef = useRef<string | null>(null);
  const organizationSlug =
    typeof params.organizationSlug === "string" ? params.organizationSlug : undefined;

  useEffect(() => {
    if (typeof window === "undefined" || !posthog.__loaded) {
      return;
    }

    const userId = user?.id;
    if (userId) {
      if (identifiedUserIdRef.current !== userId) {
        posthog.identify(userId);
        identifiedUserIdRef.current = userId;
      }
      if (organizationSlug) {
        posthog.group("organization", organizationSlug);
      }
      return;
    }

    if (identifiedUserIdRef.current) {
      posthog.reset();
      identifiedUserIdRef.current = null;
    }
  }, [organizationSlug, user?.id]);

  return null;
}
