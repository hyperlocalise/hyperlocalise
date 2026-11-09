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
import { describe, expect, it } from "vite-plus/test";

import {
  GITLAB_CONTENT_SYNC_UPLOAD_SURFACE,
  buildDefaultContentSyncTriggerMode,
  contentSyncNeedsPathTemplate,
  contentSyncNeedsProviderFolder,
  defaultContentSyncName,
  defaultContentSyncProjectFolder,
  uploadSurfaceKeepsMissingKeys,
} from "./content-sync-types";

describe("uploadSurfaceKeepsMissingKeys", () => {
  it("keeps keys only for a GitLab content sync upload", () => {
    expect(uploadSurfaceKeepsMissingKeys(GITLAB_CONTENT_SYNC_UPLOAD_SURFACE)).toBe(true);
    expect(uploadSurfaceKeepsMissingKeys("github")).toBe(false);
    expect(uploadSurfaceKeepsMissingKeys("")).toBe(false);
    expect(uploadSurfaceKeepsMissingKeys(null)).toBe(false);
  });
});

describe("content sync defaults", () => {
  it("asks GitLab for a language path template and git providers for a folder", () => {
    expect(contentSyncNeedsPathTemplate("gitlab")).toBe(true);
    expect(contentSyncNeedsPathTemplate("github")).toBe(false);
    expect(contentSyncNeedsProviderFolder("gitlab")).toBe(true);
    expect(contentSyncNeedsProviderFolder("github")).toBe(true);
    expect(contentSyncNeedsProviderFolder("contentful")).toBe(false);
  });

  it("builds a project folder from the provider and a cleaned resource key", () => {
    expect(defaultContentSyncProjectFolder({ provider: "gitlab", resourceKey: "/acme/web/" })).toBe(
      "gitlab/acme/web",
    );
    expect(
      defaultContentSyncProjectFolder({
        provider: "github",
        resourceKey: "acme/web pages",
      }),
    ).toBe("github/acme/web-pages");
    expect(defaultContentSyncProjectFolder({ provider: "gitlab", resourceKey: "   " })).toBe(
      "gitlab",
    );
    expect(defaultContentSyncName({ provider: "gitlab", resourceKey: "acme/web" })).toBe(
      "Sync acme/web",
    );
    expect(buildDefaultContentSyncTriggerMode("gitlab")).toBe("manual");
    expect(buildDefaultContentSyncTriggerMode("github")).toBe("github");
  });
});
