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
  isInternalStorageFilename,
  nativeJobSourceFileDisplayLabel,
  originalFilenameFromStoredName,
  resolveNativeJobSourceFileDisplay,
} from "./native-job-source-file-display";

describe("originalFilenameFromStoredName", () => {
  it("keeps a plain original filename", () => {
    expect(originalFilenameFromStoredName("messages.json")).toBe("messages.json");
  });

  it("extracts the filename from a Vercel Blob storage key", () => {
    expect(
      originalFilenameFromStoredName(
        "organizations/org_1/projects/project_1/files/file_abc/messages.json",
      ),
    ).toBe("messages.json");
  });

  it("extracts the filename from a Vercel Blob URL", () => {
    expect(
      originalFilenameFromStoredName(
        "https://abc.blob.vercel-storage.com/organizations/org_1/workspace/files/file_abc/brief.docx",
      ),
    ).toBe("brief.docx");
  });

  it("does not treat stored file ids as display names", () => {
    expect(originalFilenameFromStoredName("file_3b017712-ec57-448f-8015-ca282a5a103a")).toBe(
      "file",
    );
  });
});

describe("isInternalStorageFilename", () => {
  it("detects stored file ids and blob keys", () => {
    expect(isInternalStorageFilename("file_3b017712-ec57-448f-8015-ca282a5a103a")).toBe(true);
    expect(
      isInternalStorageFilename("organizations/org_1/workspace/files/file_abc/messages.json"),
    ).toBe(true);
    expect(isInternalStorageFilename("messages.json")).toBe(false);
    expect(isInternalStorageFilename("locales/en.json")).toBe(false);
  });
});

describe("resolveNativeJobSourceFileDisplay", () => {
  it("prefers persisted metadata over the stored file id", () => {
    expect(
      resolveNativeJobSourceFileDisplay({
        inputPayload: {
          sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
          metadata: {
            sourceFilename: "home.json",
            sourcePath: "marketing/home.json",
          },
        },
      }),
    ).toEqual({
      storedFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
      filename: "home.json",
      sourcePath: "marketing/home.json",
    });
  });

  it("uses enriched API fields when metadata is missing", () => {
    expect(
      resolveNativeJobSourceFileDisplay({
        inputPayload: { sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a" },
        sourceFilename: "pricing.json",
        sourcePath: "marketing/pricing.json",
      }),
    ).toEqual({
      storedFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
      filename: "pricing.json",
      sourcePath: "marketing/pricing.json",
    });
  });

  it("keeps a legacy path-shaped sourceFileId as the display path", () => {
    expect(
      resolveNativeJobSourceFileDisplay({
        inputPayload: { sourceFileId: "marketing/home.json" },
      }),
    ).toEqual({
      storedFileId: "marketing/home.json",
      filename: "home.json",
      sourcePath: "marketing/home.json",
    });
  });

  it("does not surface a stored file id as the filename", () => {
    expect(
      resolveNativeJobSourceFileDisplay({
        inputPayload: { sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a" },
      }),
    ).toEqual({
      storedFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
      filename: "file",
      sourcePath: "file",
    });
  });

  it("returns a display label for UI surfaces", () => {
    expect(
      nativeJobSourceFileDisplayLabel({
        inputPayload: { sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a" },
        sourceFilename: "brief.docx",
      }),
    ).toBe("brief.docx");
  });
});
