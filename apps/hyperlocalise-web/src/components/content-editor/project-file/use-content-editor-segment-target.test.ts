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
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vite-plus/test";

import { createCatTranslation } from "@/components/content-editor/shared/content-editor-api.fixture";
import { CONTENT_EDITOR_ALL_FILES_SOURCE_PATH } from "@/lib/projects/content-editor-all-files";

import {
  createSegmentTargetQuerySource,
  projectFileCatSegmentTargetQueryKey,
  segmentTargetQueryIdentity,
} from "./use-content-editor-segment-target";

const scope = {
  organizationSlug: "acme",
  projectId: "project-1",
  targetLocale: "fr",
};

describe("segmentTargetQueryIdentity", () => {
  it("uses each row's resource identity ahead of the All Files file-level fallback", () => {
    expect(
      segmentTargetQueryIdentity(
        {
          sourcePath: " locales/en.json ",
          externalResourceId: "file-2",
          resourceType: "file",
        },
        {
          sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
          externalResourceId: null,
          resourceType: null,
        },
      ),
    ).toEqual({
      sourcePath: "locales/en.json",
      externalResourceId: "file-2",
      resourceType: "file",
    });
  });

  it("keeps the file-level identity when the row does not carry its own", () => {
    expect(
      segmentTargetQueryIdentity(undefined, {
        sourcePath: "home.json",
        externalResourceId: "file-1",
        resourceType: "file",
      }),
    ).toEqual({
      sourcePath: "home.json",
      externalResourceId: "file-1",
      resourceType: "file",
    });
  });
});

describe("createSegmentTargetQuerySource", () => {
  it("reads a cached target under the segment resource identity, not the All Files file key", () => {
    const queryClient = new QueryClient();
    const translation = createCatTranslation({ text: "Bonjour" });
    const segment = {
      sourcePath: "locales/en.json",
      externalResourceId: "file-2",
      resourceType: "file" as const,
    };
    queryClient.setQueryData(
      projectFileCatSegmentTargetQueryKey({
        ...scope,
        ...segment,
        externalStringId: "seg-1",
      }),
      translation,
    );

    const source = createSegmentTargetQuerySource(queryClient, {
      ...scope,
      identityFor: () =>
        segmentTargetQueryIdentity(segment, {
          sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
          externalResourceId: null,
        }),
    });
    const fileLevelSource = createSegmentTargetQuerySource(queryClient, {
      ...scope,
      identityFor: () =>
        segmentTargetQueryIdentity(undefined, {
          sourcePath: CONTENT_EDITOR_ALL_FILES_SOURCE_PATH,
          externalResourceId: null,
        }),
    });

    expect(source.get("seg-1")).toEqual(translation);
    expect(fileLevelSource.get("seg-1")).toBeUndefined();
    queryClient.clear();
  });
});
