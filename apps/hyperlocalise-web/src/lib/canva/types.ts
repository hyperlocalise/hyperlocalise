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
export type CanvaDesignSegment = {
  key: string;
  pageIndex: number;
  contentIndex: number;
  regionIndex: number;
  text: string;
};

export type StartCanvaLocalizationResult = {
  jobId: string;
};

export type CanvaLocalizationStatus =
  | {
      jobId: string;
      status: "queued" | "running";
    }
  | {
      jobId: string;
      status: "succeeded";
      translationsByLocale: Record<string, Record<string, string>>;
    };

export type CanvaVerifiedUser = {
  userId: string;
  brandId: string;
};

export type CanvaOrganizationSummary = {
  id: string;
  name: string;
  slug: string | null;
  role: string;
};

export type CanvaProjectSummary = {
  id: string;
  name: string;
  sourceLocale: string | null;
  targetLocales: string[];
};
