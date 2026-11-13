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
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  DEFAULT_POSTHOG_HOST,
  POSTHOG_INGEST_PATH,
  isPostHogConfigured,
  posthogIngestHost,
  posthogNextRewrites,
  posthogProjectToken,
  posthogUiHost,
} from "./posthog-config";

const originalToken = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const originalHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

afterEach(() => {
  if (originalToken === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = originalToken;
  }
  if (originalHost === undefined) {
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;
  } else {
    process.env.NEXT_PUBLIC_POSTHOG_HOST = originalHost;
  }
});

describe("posthog config", () => {
  it("treats a missing token as unconfigured", () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
    delete process.env.NEXT_PUBLIC_POSTHOG_HOST;

    expect(posthogProjectToken()).toBeUndefined();
    expect(isPostHogConfigured()).toBe(false);
    expect(posthogIngestHost()).toBe(DEFAULT_POSTHOG_HOST);
    expect(posthogNextRewrites()).toEqual([]);
  });

  it("rewrites same-origin ingest to the configured cloud host", () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = "phc_test";
    process.env.NEXT_PUBLIC_POSTHOG_HOST = "https://eu.i.posthog.com/";

    expect(isPostHogConfigured()).toBe(true);
    expect(posthogIngestHost()).toBe("https://eu.i.posthog.com");
    expect(posthogUiHost()).toBe("https://eu.posthog.com");
    expect(posthogNextRewrites()).toEqual([
      {
        source: `${POSTHOG_INGEST_PATH}/static/:path*`,
        destination: "https://eu.i.posthog.com/static/:path*",
      },
      {
        source: `${POSTHOG_INGEST_PATH}/:path*`,
        destination: "https://eu.i.posthog.com/:path*",
      },
    ]);
  });
});
