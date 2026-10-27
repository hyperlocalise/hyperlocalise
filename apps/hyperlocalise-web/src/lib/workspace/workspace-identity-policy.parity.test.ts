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
import { readFileSync } from "node:fs";
import path from "node:path";

import { profaneWords } from "@2toad/profanity";
import { describe, expect, it } from "vite-plus/test";

import { updateWorkspaceBodySchema } from "@/api/routes/workspace/workspace.schema";

import { isAllowedWorkspaceIdentity } from "./workspace-identity-policy";

const goSvcDir = path.resolve(import.meta.dirname, "../../../../go-svc");

type ParityCases = {
  identity: { input: string; allowed: boolean }[];
  payload: {
    name: string;
    body: unknown;
    data?: Record<string, string>;
    issues?: { path: (string | number)[]; message: string }[];
  }[];
};

const cases = JSON.parse(
  readFileSync(path.join(goSvcDir, "testdata/workspace-identity/cases.json"), "utf8"),
) as ParityCases;

describe("workspace identity parity with go-svc", () => {
  it.each(cases.identity)(
    "isAllowedWorkspaceIdentity($input) is $allowed",
    ({ input, allowed }) => {
      expect(isAllowedWorkspaceIdentity(input)).toBe(allowed);
    },
  );

  it.each(cases.payload)("update payload: $name", ({ body, data, issues }) => {
    const parsed = updateWorkspaceBodySchema.safeParse(body);
    if (issues) {
      expect(parsed.success).toBe(false);
      expect(parsed.error?.issues.map(({ path, message }) => ({ path, message }))).toEqual(issues);
    } else {
      expect(parsed).toEqual({ success: true, data });
    }
  });

  it("embeds the installed English profanity list", () => {
    const embedded = readFileSync(
      path.join(goSvcDir, "workspace-identity-profanity-en.txt"),
      "utf8",
    )
      .split("\n")
      .filter((line) => line !== "" && !line.startsWith("#"));
    expect(embedded).toEqual(profaneWords.get("en"));
  });
});
