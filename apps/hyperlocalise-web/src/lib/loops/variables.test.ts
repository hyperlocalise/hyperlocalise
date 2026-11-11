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
  protectLoopsVariableFields,
  protectLoopsVariables,
  restoreLoopsVariableFields,
  restoreLoopsVariables,
} from "./variables";

describe("loops variables", () => {
  it("protects data, contact, and event tokens", () => {
    const { text, tokens } = protectLoopsVariables(
      "Hi {data.name}, {contact.email} did {event.name}",
    );

    expect(tokens).toEqual(["{data.name}", "{contact.email}", "{event.name}"]);
    expect(text).not.toContain("{data.name}");
    expect(restoreLoopsVariables(text, tokens)).toBe(
      "Hi {data.name}, {contact.email} did {event.name}",
    );
  });

  it("leaves unknown braces alone", () => {
    const { text, tokens } = protectLoopsVariables("Use {count} items");

    expect(tokens).toEqual([]);
    expect(text).toBe("Use {count} items");
  });

  it("protects and restores record fields", () => {
    const { fields, tokensByField } = protectLoopsVariableFields({
      subject: "Hi {data.name}",
      previewText: undefined,
    });

    expect(fields.subject).not.toContain("{data.name}");
    expect(restoreLoopsVariableFields(fields, tokensByField).subject).toBe("Hi {data.name}");
  });
});
