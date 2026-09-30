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

import { createNativeJobDetail } from "../job-detail.fixture";
import { nativeJobToProjectFileRecord } from "./job-source-file-mappers";

describe("nativeJobToProjectFileRecord", () => {
  it("maps the original filename and path instead of the stored file id", () => {
    const record = nativeJobToProjectFileRecord(
      createNativeJobDetail({
        inputPayload: {
          sourceFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
          sourceLocale: "en",
          targetLocales: ["fr-FR"],
          fileFormat: "json",
        },
        sourceFilename: "home.json",
        sourcePath: "marketing/home.json",
      }),
    );

    expect(record).toMatchObject({
      storedFileId: "file_3b017712-ec57-448f-8015-ca282a5a103a",
      filename: "home.json",
      sourcePath: "marketing/home.json",
    });
  });

  it("keeps a legacy path-shaped sourceFileId as the display path", () => {
    const record = nativeJobToProjectFileRecord(createNativeJobDetail());

    expect(record).toMatchObject({
      storedFileId: "marketing/home.json",
      filename: "home.json",
      sourcePath: "marketing/home.json",
    });
  });
});
