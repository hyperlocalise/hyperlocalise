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

import { serializeOtaFile, toOtaPublicFormat } from "./formats";
import { exportPathFromSourcePath, findExportPathCollisions } from "./export-path";

describe("ota formats", () => {
  it("maps storage enums to public format names", () => {
    expect(toOtaPublicFormat("json")).toBe("json");
    expect(toOtaPublicFormat("android_xml")).toBe("android-xml");
    expect(toOtaPublicFormat("ios_strings")).toBe("ios-strings");
  });

  it("serializes empty and populated files", () => {
    expect(serializeOtaFile("json", []).toString("utf8")).toBe("{}");
    expect(serializeOtaFile("android_xml", []).toString("utf8")).toContain("<resources>");
    expect(serializeOtaFile("ios_strings", []).toString("utf8")).toBe("");
    expect(serializeOtaFile("json", [{ key: "hi", text: "Hello" }]).toString("utf8")).toBe(
      JSON.stringify({ hi: "Hello" }),
    );
    expect(
      serializeOtaFile("android_xml", [{ key: "a.b", text: "Hi" }]).toString("utf8"),
    ).toContain('name="a_b"');
    expect(
      serializeOtaFile("ios_strings", [{ key: "hi", text: 'say "hi"' }]).toString("utf8"),
    ).toContain('"hi" = "say \\"hi\\"";');
  });
});

describe("exportPathFromSourcePath", () => {
  it("uses the basename and reports collisions", () => {
    expect(exportPathFromSourcePath("locales/en/messages.json")).toBe("/messages.json");
    expect(
      findExportPathCollisions(["locales/en/messages.json", "locales/fr/messages.json"]),
    ).toEqual(["/messages.json"]);
  });
});
