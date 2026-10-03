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
import { QueryClient } from "@tanstack/react-query";
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
import { projectFileCatSegmentTargetQueryKey } from "../project-file/use-content-editor-segment-target";
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
      context: null,
      maxLength: null,
      targetText: "",
      status: "draft",
      isHidden: false,
      isLocked: false,
      matchesFilter: true,
      sourceRevision: "10",
      translationRevision: "missing",
    };
    const applyStringGroup = vi.fn().mockResolvedValue({ operationId: "op", members: [] });
    const client = {
      cat: {
        applyStringGroup,
        stringGroupMembers: vi.fn().mockResolvedValue({
          members: [
            member,
            { ...member, id: "b", sourcePath: "b.json", isLocked: true, matchesFilter: true },
          ],
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
  it("stores the editor translation object when activity loads a target", async () => {
    const user = userEvent.setup();
    const translation = {
      revision: "12",
      text: "Enregistrer",
      externalTranslationId: "t1",
      isApproved: false,
    };
    const queryKey = projectFileCatSegmentTargetQueryKey({
      organizationSlug: "acme",
      projectId: "p1",
      sourcePath: "a.json",
      targetLocale: "fr",
      externalStringId: "segment",
    });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const segmentTarget = vi.fn().mockResolvedValue({ target: translation });
    const activityLogs = vi.fn().mockResolvedValue({
      activityLogs: [
        {
          id: "e1",
          eventType: "string_segment_translation_updated",
          createdAt: "2026-10-01T00:00:00.000Z",
          actor: { displayName: "Ada" },
          payload: {
            segmentId: "segment",
            sourcePath: "a.json",
            targetLocale: "fr",
            afterRevision: "12",
          },
        },
      ],
      nextCursor: null,
    });
    const client = { cat: { activityLogs, segmentTarget } } as unknown as GoSvcClient;
    renderWithContentEditorProviders(
      <SegmentActivityProvider
        client={client}
        organizationSlug="acme"
        projectId="p1"
        sourcePath="*"
        targetLocale="fr"
      >
        <SegmentActivityButton segmentId="segment" sourcePath="a.json" label="save" />
      </SegmentActivityProvider>,
      { queryClient },
    );
    await user.click(screen.getByRole("button", { name: "Activity" }));
    await user.click(screen.getByText("View translation"));
    expect(await screen.findByText("Enregistrer")).toBeInTheDocument();
    expect(screen.getByText("Translation saved in this edit")).toBeInTheDocument();
    expect(queryClient.getQueryData(queryKey)).toEqual(translation);
  });
  it("reads a translation already cached by the editor", async () => {
    const user = userEvent.setup();
    const translation = {
      revision: "8",
      text: "Sauvegarder",
      externalTranslationId: "t1",
      isApproved: false,
    };
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(
      projectFileCatSegmentTargetQueryKey({
        organizationSlug: "acme",
        projectId: "p1",
        sourcePath: "a.json",
        targetLocale: "fr",
        externalStringId: "segment",
      }),
      translation,
    );
    const segmentTarget = vi.fn();
    const activityLogs = vi.fn().mockResolvedValue({
      activityLogs: [
        {
          id: "e1",
          eventType: "string_segment_translation_updated",
          createdAt: "2026-10-01T00:00:00.000Z",
          actor: { displayName: "Ada" },
          payload: {
            segmentId: "segment",
            sourcePath: "a.json",
            targetLocale: "fr",
            afterRevision: "7",
          },
        },
      ],
      nextCursor: null,
    });
    const client = { cat: { activityLogs, segmentTarget } } as unknown as GoSvcClient;
    renderWithContentEditorProviders(
      <SegmentActivityProvider
        client={client}
        organizationSlug="acme"
        projectId="p1"
        sourcePath="*"
        targetLocale="fr"
      >
        <SegmentActivityButton segmentId="segment" sourcePath="a.json" label="save" />
      </SegmentActivityProvider>,
      { queryClient },
    );
    await user.click(screen.getByRole("button", { name: "Activity" }));
    await user.click(screen.getByText("View translation"));
    expect(await screen.findByText("Sauvegarder")).toBeInTheDocument();
    expect(screen.getByText("Current translation on this occurrence")).toBeInTheDocument();
    expect(segmentTarget).not.toHaveBeenCalled();
  });
});
