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
import { vi } from "vite-plus/test";

import type { Logger } from "@/lib/log";

/**
 * Full logger surface for `vi.mock("@/lib/log")`.
 * Tests share one module graph (`isolate: false`); an incomplete mock leaks
 * `logger.warn is not a function` into later files in the same worker.
 */
export function createTestLogger(overrides: Partial<Logger> = {}): Logger {
  const logger: Logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    child: () => logger,
    ...overrides,
  };
  if (!overrides.child) {
    logger.child = () => createTestLogger(overrides);
  }
  return logger;
}
