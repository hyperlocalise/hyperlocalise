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
import "dotenv/config";

import { afterEach, beforeAll, describe, expect, it } from "vite-plus/test";

import { syncWorkosIdentity } from "@/api/auth/workos-sync";
import { createAuthTestFixture } from "@/api/test-auth.fixture";
import { db } from "@/lib/database/client";
import { isErr } from "@/lib/primitives/result/results";

import { createVisualWorkflow } from "../visual-workflows";
import { takeRoundRobinTurn } from "./assignment-actions";

const fixture = createAuthTestFixture();

beforeAll(async () => {
  await db.$client.query("select 1");
});

afterEach(async () => {
  await fixture.cleanup();
});

describe("takeRoundRobinTurn", () => {
  it("returns the assignee stored for a step key after a later run moved the cursor", async () => {
    const identity = fixture.createWorkosIdentityWithRole("admin");
    const { organization } = await syncWorkosIdentity(db, identity);
    const created = await createVisualWorkflow({
      organizationId: organization.id,
      name: "Round robin",
    });
    if (isErr(created)) {
      throw new Error(created.error.code);
    }

    const turn = {
      visualWorkflowId: created.value.id,
      nodeId: "pick",
      ruleId: "fallback",
      pool: ["a", "b", "c"],
    };

    const first = await takeRoundRobinTurn({ ...turn, stepKey: "run-a/pick/0" });
    const second = await takeRoundRobinTurn({ ...turn, stepKey: "run-b/pick/0" });
    const retried = await takeRoundRobinTurn({ ...turn, stepKey: "run-a/pick/0" });
    const third = await takeRoundRobinTurn({ ...turn, stepKey: "run-c/pick/0" });

    expect(first).toBe("a");
    expect(second).toBe("b");
    expect(retried).toBe("a");
    expect(third).toBe("c");
  });
});
