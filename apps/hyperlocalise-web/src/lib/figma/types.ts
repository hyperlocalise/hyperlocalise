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
export type FigmaDesignSegment = {
  key: string;
  nodeId: string;
  regionIndex: number;
  text: string;
};

export type StartFigmaLocalizationResult = {
  jobId: string;
  generated: boolean;
};

export type FigmaLocalizationStatus =
  | {
      jobId: string;
      status: "queued" | "running";
    }
  | {
      jobId: string;
      status: "succeeded";
      translationsByLocale: Record<string, Record<string, string>>;
    };
