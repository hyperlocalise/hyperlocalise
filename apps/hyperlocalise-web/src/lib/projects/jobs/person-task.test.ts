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

import { isMarkableProofreadTask, readWorkflowTaskStep } from "./person-task";

describe("person-task", () => {
  it("reads the visual-workflow step from job metadata", () => {
    expect(readWorkflowTaskStep({ metadata: { workflowTaskStep: "edit" } })).toBe("edit");
    expect(readWorkflowTaskStep({ metadata: { workflowTaskStep: "proofread" } })).toBe("proofread");
    expect(readWorkflowTaskStep({ metadata: {} })).toBeNull();
    expect(readWorkflowTaskStep({})).toBeNull();
  });

  it("marks only open proofread tasks, not post-edit or translation", () => {
    expect(
      isMarkableProofreadTask({
        kind: "proofread",
        status: "waiting_for_review",
        assigneeType: "user",
      }),
    ).toBe(true);
    expect(
      isMarkableProofreadTask({
        kind: "proofread",
        status: "waiting_for_review",
        inputPayload: { metadata: { workflowTaskStep: "proofread" } },
      }),
    ).toBe(true);
    expect(
      isMarkableProofreadTask({
        kind: "proofread",
        status: "waiting_for_review",
        inputPayload: { metadata: { workflowTaskStep: "edit" } },
      }),
    ).toBe(false);
    expect(
      isMarkableProofreadTask({
        kind: "translation",
        status: "waiting_for_review",
        assigneeType: "user",
      }),
    ).toBe(false);
  });
});
