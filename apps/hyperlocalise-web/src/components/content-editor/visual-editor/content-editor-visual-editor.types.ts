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
import type {
  ContentEditorSegment,
  ContentEditorSegmentIntelligence,
} from "@/components/content-editor/shared/types";

export type ContentEditorVisualEditorDevice = "desktop" | "tablet" | "mobile";

export type ContentEditorVisualEditorPreviewKind = "home" | "pricing" | "generic";

export type ContentEditorVisualEditorNodeMeta = {
  tagName: "H1" | "H2" | "H3" | "P" | "A" | "BUTTON" | "SPAN";
  selector: string;
};

export type ContentEditorVisualEditorSegment = ContentEditorSegment & {
  node: ContentEditorVisualEditorNodeMeta;
};

export type ContentEditorVisualEditorProgress = {
  locale: string;
  percent: number;
  translated: number;
  inReview: number;
  untranslated: number;
};

export type ContentEditorVisualEditorFilePage = {
  sourcePath: string;
  previewUrl: string;
  previewKind: ContentEditorVisualEditorPreviewKind;
  progress: ContentEditorVisualEditorProgress;
  segments: ContentEditorVisualEditorSegment[];
  defaultSelectedSegmentId: string;
  intelligenceBySegmentId: Record<string, ContentEditorSegmentIntelligence>;
};

export type ContentEditorVisualEditorFixture = {
  files: ProjectFileRecord[];
  selectedSourcePath: string;
  pagesBySourcePath: Record<string, ContentEditorVisualEditorFilePage>;
};
