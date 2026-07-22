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
import { db } from "@/lib/database";
import { createLogger, type Logger } from "@/lib/log";

/**
 * Shared foundation for project domain services: injectable database access
 * and a namespaced logger for structured, PII-safe operational logging.
 */
export abstract class ProjectServiceBase {
  protected readonly log: Logger;

  constructor(
    protected readonly database: typeof db = db,
    namespace: string,
  ) {
    this.log = createLogger(namespace);
  }
}
