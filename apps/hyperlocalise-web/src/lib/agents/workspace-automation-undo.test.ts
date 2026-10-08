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
  describeWorkspaceAutomationDiscard,
  describeWorkspaceAutomationFormChange,
  describeWorkspaceAutomationReload,
  diffWorkspaceAutomationFormFields,
  workspaceAutomationUndoStackOptions,
} from "./workspace-automation-undo";
import { createDefaultWorkspaceAutomationFormState } from "./workspace-automation-view-model";

const base = createDefaultWorkspaceAutomationFormState();

describe("diffWorkspaceAutomationFormFields", () => {
  it("lists the fields whose values differ, comparing arrays by value", () => {
    expect(
      diffWorkspaceAutomationFormFields(base, {
        ...base,
        name: "Weekly summary",
        skillIds: [...base.skillIds],
        emailRecipients: ["a@example.com"],
      }),
    ).toEqual(["name", "emailRecipients"]);
  });

  it("is empty for equal forms", () => {
    expect(diffWorkspaceAutomationFormFields(base, { ...base })).toEqual([]);
  });
});

describe("describeWorkspaceAutomationFormChange", () => {
  it("merges typing in one text field under a key for that field", () => {
    expect(describeWorkspaceAutomationFormChange(base, { ...base, name: "W" })).toEqual({
      kind: "edit",
      fields: ["name"],
      group: "name",
      coalesceKey: "text:name",
    });
  });

  it("gives a select change no key", () => {
    const change = describeWorkspaceAutomationFormChange(base, { ...base, status: "paused" });

    expect(change).toEqual({ kind: "edit", fields: ["status"], group: "status" });
  });

  it("names the group from the first changed field", () => {
    expect(
      describeWorkspaceAutomationFormChange(base, {
        ...base,
        triggerMode: "scheduled",
        scheduledCadence: "weekly",
      }),
    ).toMatchObject({ group: "trigger", fields: ["triggerMode", "scheduledCadence"] });
    expect(
      describeWorkspaceAutomationFormChange(base, { ...base, skillIds: ["summarise"] }),
    ).toMatchObject({ group: "skills" });
    expect(
      describeWorkspaceAutomationFormChange(base, { ...base, slackEnabled: true }),
    ).toMatchObject({ group: "tools" });
  });

  it("falls back to settings for a field inside a tool, with no key when several change", () => {
    expect(
      describeWorkspaceAutomationFormChange(base, {
        ...base,
        emailFrom: "team@example.com",
        emailRecipients: ["a@example.com"],
      }),
    ).toEqual({ kind: "edit", fields: ["emailFrom", "emailRecipients"], group: "settings" });
  });
});

describe("discard and reload descriptions", () => {
  it("record the fields put back", () => {
    const edited = { ...base, name: "Edited", status: "paused" as const };

    expect(describeWorkspaceAutomationDiscard(edited, base)).toEqual({
      kind: "discard",
      fields: ["name", "status"],
    });
    expect(describeWorkspaceAutomationReload(edited, base)).toEqual({
      kind: "reload",
      fields: ["name", "status"],
    });
  });
});

describe("workspaceAutomationUndoStackOptions", () => {
  it("treats equal forms, the same reference and two nulls as equal", () => {
    const { isEqual } = workspaceAutomationUndoStackOptions;

    expect(isEqual(base, { ...base })).toBe(true);
    expect(isEqual(base, base)).toBe(true);
    expect(isEqual(null, null)).toBe(true);
    expect(isEqual(null, base)).toBe(false);
    expect(isEqual(base, { ...base, name: "x" })).toBe(false);
  });

  it("describes nothing while a form is null and reads the key from an edit", () => {
    const { describe: describeChange, coalesceKeyOf } = workspaceAutomationUndoStackOptions;

    expect(describeChange(null, base)).toBeNull();
    expect(coalesceKeyOf?.(describeChange(base, { ...base, instructions: "Do" }))).toBe(
      "text:instructions",
    );
    expect(coalesceKeyOf?.(null)).toBeUndefined();
  });
});
