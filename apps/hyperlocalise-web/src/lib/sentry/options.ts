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

/** Public project DSN. Override with NEXT_PUBLIC_SENTRY_DSN per environment. */
export const SENTRY_DSN =
  process.env.NEXT_PUBLIC_SENTRY_DSN ??
  "https://e8d626aa37a0f72a4f3af93a6c4bac21@o4511618181038080.ingest.us.sentry.io/4511618242904064";

/** Lower sample rate in production to control ingestion cost and latency. */
export const SENTRY_TRACES_SAMPLE_RATE = process.env.NODE_ENV === "production" ? 0.1 : 1;
