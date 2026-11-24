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
import { sql } from "drizzle-orm";

import { schema } from "@/lib/database/client";

/**
 * A QA run that checked the whole project. A run narrowed to one file or some languages (a
 * workflow's Run QA step) says nothing about the rest, so it never stands in for the project's
 * latest scan: not on the QA tab, in the workspace summary, or as the scan a new one is compared to.
 * go-svc's QA report reads apply the same filter.
 */
export const projectWideQaRun = sql`not (${schema.translationQaRuns.summary} ? 'scope')`;
