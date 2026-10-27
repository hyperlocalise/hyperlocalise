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
import { z } from "zod";

import type { LocalisationAuditPageLayout } from "./types";

const MAX_LAYOUT_VIEWPORTS = 4;
const MAX_LAYOUT_ELEMENTS = 12;
const MAX_LAYOUT_TEXT_CHARS = 120;

const layoutElementSchema = z.object({
  tag: z.string().trim().min(1).max(32),
  text: z.string().transform((value) => value.trim().slice(0, MAX_LAYOUT_TEXT_CHARS)),
});

const layoutViewportSchema = z.object({
  width: z.number().int().positive(),
  horizontalOverflowPx: z.number().min(0),
  clippedText: z
    .array(layoutElementSchema)
    .transform((items) => items.slice(0, MAX_LAYOUT_ELEMENTS)),
  offscreen: z.array(layoutElementSchema).transform((items) => items.slice(0, MAX_LAYOUT_ELEMENTS)),
});

const pageLayoutSchema = z.object({
  viewports: z
    .array(layoutViewportSchema)
    .min(1)
    .transform((items) => items.slice(0, MAX_LAYOUT_VIEWPORTS)),
});

/** Layout measurements come from page-controlled JS output, so treat them as untrusted. */
export function parseAuditPageLayout(value: unknown): LocalisationAuditPageLayout | null {
  const parsed = pageLayoutSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}
