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

import { formDefinitionForWrite } from "./form-write";

describe("formDefinitionForWrite", () => {
  it("keeps a createdAt date on a new form", () => {
    const definition = formDefinitionForWrite(
      {
        id: "source-form",
        name: "Newsletter",
        fieldGroups: [],
        configuration: { language: "en" },
      },
      { name: "Newsletter [zh-CN]", language: "zh-cn", create: true },
    );

    expect(definition.id).toBeUndefined();
    expect(definition.name).toBe("Newsletter [zh-CN]");
    expect(definition.createdAt).toBeInstanceOf(Date);
    expect(definition.updatedAt).toBeInstanceOf(Date);
    expect(definition.archived).toBe(false);
    expect(definition.configuration).toMatchObject({ language: "zh-cn" });
  });
});
