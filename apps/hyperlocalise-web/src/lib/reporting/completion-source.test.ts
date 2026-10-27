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

import { personSave, sourceOfProvenance } from "./completion-source";

describe("completion source", () => {
  it("maps editor provenance onto the summary buckets", () => {
    expect(sourceOfProvenance("manual")).toBe("person");
    expect(sourceOfProvenance("import")).toBe("import");
    expect(sourceOfProvenance("translation_job")).toBe("ai");
    expect(sourceOfProvenance("agent")).toBe("ai");
  });

  it("credits a person only when they changed the text they were given", () => {
    expect(personSave(undefined)).toEqual({ source: "person", unchanged: false });
    expect(personSave({ source: "ai", unchanged: true })).toEqual({
      source: "ai",
      unchanged: true,
    });
    expect(personSave({ source: "ai", unchanged: false })).toEqual({
      source: "person",
      unchanged: false,
    });
    expect(personSave({ source: "import", unchanged: true })).toEqual({
      source: "import",
      unchanged: true,
    });
  });
});
