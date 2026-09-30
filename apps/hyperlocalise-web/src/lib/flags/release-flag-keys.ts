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
export const RELEASE_CAT_ALL_FILES_FLAG = "release-content-editor-all-files";

/** Create Vercel Sandboxes from the hyperlocalise-sandbox VCR image. */
export const RELEASE_SANDBOX_VCR_IMAGE_FLAG = "release-sandbox-vcr-image";

/**
 * Adaptive workspace personas for the Content Editor (Translator / Designer / Reviewer).
 * Feature is off by default; enable per-org or globally via Flags Explorer for A/B testing.
 */
export const RELEASE_CAT_ADAPTIVE_WORKSPACE_FLAG = "release-content-editor-adaptive-workspace";
