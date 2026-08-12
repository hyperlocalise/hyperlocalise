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
import type { ProjectFileRecord } from "@/api/routes/project/project.schema";
import type { CatSegment, CatSegmentIntelligence } from "@/components/cat/shared/types";

export type CatVisualEditorDevice = "desktop" | "tablet" | "mobile";

export type CatVisualEditorPreviewKind = "home" | "pricing" | "generic";

export type CatVisualEditorNodeMeta = {
  tagName: "H1" | "H2" | "H3" | "P" | "A" | "BUTTON" | "SPAN";
  selector: string;
};

export type CatVisualEditorSegment = CatSegment & {
  node: CatVisualEditorNodeMeta;
};

export type CatVisualEditorProgress = {
  locale: string;
  percent: number;
  translated: number;
  inReview: number;
  untranslated: number;
};

export type CatVisualEditorFilePage = {
  sourcePath: string;
  previewUrl: string;
  previewKind: CatVisualEditorPreviewKind;
  progress: CatVisualEditorProgress;
  segments: CatVisualEditorSegment[];
  defaultSelectedSegmentId: string;
  intelligenceBySegmentId: Record<string, CatSegmentIntelligence>;
};

export type CatVisualEditorFixture = {
  files: ProjectFileRecord[];
  selectedSourcePath: string;
  pagesBySourcePath: Record<string, CatVisualEditorFilePage>;
};
