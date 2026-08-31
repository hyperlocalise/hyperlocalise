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

import { hyperlocaliseManagedGatewayModelId } from "@/lib/providers/language-model";

import { resolveEvalModel } from "./eval-model";

describe("resolveEvalModel", () => {
  it("uses the production gateway model when the env value is omitted or blank", () => {
    expect(resolveEvalModel(undefined)).toBe(hyperlocaliseManagedGatewayModelId);
    expect(resolveEvalModel("")).toBe(hyperlocaliseManagedGatewayModelId);
    expect(resolveEvalModel("   ")).toBe(hyperlocaliseManagedGatewayModelId);
  });

  it("keeps an explicit gateway model id", () => {
    expect(resolveEvalModel("anthropic/claude-sonnet-4.5")).toBe("anthropic/claude-sonnet-4.5");
  });
});
