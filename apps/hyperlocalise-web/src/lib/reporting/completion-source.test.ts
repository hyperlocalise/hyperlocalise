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

import { personSave, sourceOfOrigin, sourceOfProvenance } from "./completion-source";

describe("completion source", () => {
  it("maps editor provenance onto the summary buckets", () => {
    expect(sourceOfProvenance("manual")).toBe("person");
    expect(sourceOfProvenance("import")).toBe("import");
    expect(sourceOfProvenance("translation_job")).toBe("ai");
    expect(sourceOfProvenance("agent")).toBe("ai");
  });

  it("credits a person only when they changed the text they were given", () => {
    expect(personSave(undefined)).toEqual({
      source: "person",
      unchanged: false,
      postEditScore: null,
    });
    expect(personSave({ source: "ai", unchanged: true, postEditScore: 100 })).toEqual({
      source: "ai",
      unchanged: true,
      postEditScore: 100,
    });
    expect(personSave({ source: "ai", unchanged: false, postEditScore: 72 })).toEqual({
      source: "person",
      unchanged: false,
      postEditScore: 72,
    });
    expect(personSave({ source: "import", unchanged: true })).toEqual({
      source: "import",
      unchanged: true,
      postEditScore: null,
    });
  });
});

describe("sourceOfOrigin", () => {
  it("reads what the person was given and whether they kept it from the saved origin", () => {
    expect(sourceOfOrigin("machine")).toEqual({ source: "ai", unchanged: true });
    expect(sourceOfOrigin("unknown")).toEqual({ source: "import", unchanged: true });
    expect(sourceOfOrigin("machine_post_edited")).toEqual({ source: "person", unchanged: false });
    expect(sourceOfOrigin("human")).toEqual({ source: "person", unchanged: false });
    expect(sourceOfOrigin(null)).toEqual({ source: "person", unchanged: false });
  });
});
