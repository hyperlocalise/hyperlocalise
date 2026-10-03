/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License 1.1,
 * use of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
// @vitest-environment happy-dom
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { renderWithContentEditorProviders } from "../shared/content-editor-test-utils";
import { ContentEditorGroupApply } from "./content-editor-group-apply";
import {
  SegmentActivityProvider,
  SegmentActivityButton,
} from "../activity-log/content-editor-segment-activity";
afterEach(cleanup);
const group = {
  id: "a".repeat(64),
  sourceText: "Save",
  occurrenceCount: 2,
  matchingCount: 2,
  translationVariants: 0,
  translatedCount: 0,
  approvedCount: 0,
  lockedCount: 1,
};
describe("group apply and activity", () => {
  it("requires explicit lock exclusion and submits preview revisions", async () => {
    const user = userEvent.setup();
    const member = {
      id: "a",
      key: "save",
      sourcePath: "a.json",
      targetText: "",
      status: "draft",
      isLocked: false,
      sourceRevision: "10",
      translationRevision: "missing",
    };
    const applyStringGroup = vi.fn().mockResolvedValue({ operationId: "op", members: [] });
    const client = {
      cat: {
        applyStringGroup,
        stringGroupMembers: vi.fn().mockResolvedValue({
          members: [member, { ...member, id: "b", sourcePath: "b.json", isLocked: true }],
          pagination: { totalCount: 2, hasMore: false },
        }),
      },
    } as unknown as GoSvcClient;
    renderWithContentEditorProviders(
      <ContentEditorGroupApply
        client={client}
        organizationSlug="acme"
        projectId="p1"
        group={group}
        query={{ sourcePath: "*", targetLocale: "fr" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Apply translation" }));
    await screen.findByText("Deselect locked occurrences to continue.");
    await user.type(screen.getByRole("textbox"), "Enregistrer");
    expect(screen.getByRole("button", { name: "Apply to 2 occurrences" })).toBeDisabled();
    await user.click(screen.getAllByRole("checkbox")[1]);
    await user.click(screen.getByRole("button", { name: "Apply to 1 occurrences" }));
    expect(applyStringGroup).toHaveBeenCalledWith("acme", "p1", group.id, {
      sourceText: "Save",
      targetLocale: "fr",
      text: "Enregistrer",
      members: [{ id: "a", sourceRevision: "10", translationRevision: "missing" }],
    });
    await screen.findByText("Translation applied.");
  });
  it("opens activity with the original segment and locale without changing the editor", async () => {
    const user = userEvent.setup();
    const activityLogs = vi.fn().mockResolvedValue({ activityLogs: [], nextCursor: null });
    const client = { cat: { activityLogs } } as unknown as GoSvcClient;
    renderWithContentEditorProviders(
      <SegmentActivityProvider
        client={client}
        organizationSlug="acme"
        projectId="p1"
        sourcePath="*"
        targetLocale="fr"
      >
        <textarea defaultValue="Unsaved draft" />
        <SegmentActivityButton segmentId="segment" sourcePath="a.json" label="save" />
      </SegmentActivityProvider>,
    );
    await user.click(screen.getByRole("button", { name: "Activity" }));
    await screen.findByText("No recorded activity for this occurrence and language.");
    expect(activityLogs).toHaveBeenCalledWith(
      "acme",
      "p1",
      expect.objectContaining({ segmentId: "segment", sourcePath: "a.json", targetLocale: "fr" }),
      expect.anything(),
    );
  });
});
