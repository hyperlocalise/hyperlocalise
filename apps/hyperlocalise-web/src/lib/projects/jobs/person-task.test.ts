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

import { isMarkableProofreadTask, personTaskStep } from "./person-task";

describe("person-task", () => {
  it("marks open proofread and post-edit tasks, not translation, agent or finished ones", () => {
    const open = { kind: "proofread", status: "waiting_for_review" };
    expect(isMarkableProofreadTask({ ...open, assigneeType: "user" })).toBe(true);
    expect(isMarkableProofreadTask(open)).toBe(true);
    expect(isMarkableProofreadTask({ ...open, assigneeType: "agent" })).toBe(false);
    expect(isMarkableProofreadTask({ ...open, status: "queued" })).toBe(false);
    expect(isMarkableProofreadTask({ ...open, kind: "translation", assigneeType: "user" })).toBe(
      false,
    );
  });

  it("names the step of a task for people", () => {
    const proofread = { kind: "proofread", assigneeType: "user" };
    expect(personTaskStep({ ...proofread, workflowTaskStep: "edit" })).toBe("edit");
    expect(personTaskStep({ ...proofread, workflowTaskStep: "proofread" })).toBe("proofread");
    // A proofread task made in the app, or one made of chosen strings, stores no step.
    expect(personTaskStep({ kind: "proofread", workflowTaskStep: null })).toBe("proofread");
    expect(
      personTaskStep({ kind: "translation", assigneeType: "user", workflowTaskStep: "translate" }),
    ).toBe("translate");
    expect(personTaskStep({ kind: "translation", workflowTaskStep: null })).toBeNull();
    expect(
      personTaskStep({ kind: "proofread", assigneeType: "agent", workflowTaskStep: "edit" }),
    ).toBeNull();
  });
});
