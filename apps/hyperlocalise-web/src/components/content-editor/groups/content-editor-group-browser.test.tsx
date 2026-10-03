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
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { GoSvcClient } from "@/lib/go-svc/go-svc-client";
import { renderWithContentEditorProviders } from "../shared/content-editor-test-utils";
import { ContentEditorGroupBrowser } from "./content-editor-group-browser";

afterEach(cleanup);
const GROUP = {
  id: "a".repeat(64),
  sourceText: "Save",
  occurrenceCount: 80,
  matchingCount: 1,
  translationVariants: 2,
  translatedCount: 2,
  approvedCount: 1,
  lockedCount: 1,
};
const PAGE = { offset: 0, limit: 25, returnedCount: 1, totalCount: 26, hasMore: true };

function setup() {
  const stringGroups = vi.fn().mockResolvedValue({ groups: [GROUP], pagination: PAGE });
  const stringGroupMembers = vi.fn().mockResolvedValue({
    members: [
      {
        id: "one",
        key: "menu.save",
        sourcePath: "menu.json",
        context: "Menu action",
        maxLength: 20,
        targetText: "Enregistrer",
        status: "approved",
        isHidden: false,
        isLocked: true,
        matchesFilter: false,
      },
    ],
    pagination: { ...PAGE, totalCount: 80 },
  });
  const client = { cat: { stringGroups, stringGroupMembers } } as unknown as GoSvcClient;
  renderWithContentEditorProviders(
    <ContentEditorGroupBrowser
      client={client}
      organizationSlug="acme"
      projectId="p1"
      sourcePath="*"
      sourcePaths="a.json,menu.json"
      targetLocale="fr"
    />,
  );
  return { stringGroups, stringGroupMembers, user: userEvent.setup() };
}

describe("grouped browsing", () => {
  it("loads members on selection and paginates them independently of groups", async () => {
    const { stringGroups, stringGroupMembers, user } = setup();
    await screen.findByText("80 occurrences");
    expect(stringGroupMembers).not.toHaveBeenCalled();
    expect(screen.getByText("Multiple translations")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Save 80 occurrences/ }));
    await screen.findByText("menu.save");
    expect(screen.getByText("Menu action")).toBeInTheDocument();
    expect(screen.getByText("Maximum length: 20")).toBeInTheDocument();
    expect(screen.getByText("Outside current filter")).toBeInTheDocument();
    expect(screen.getByText("Enregistrer")).toBeInTheDocument();
    expect(screen.getByText("Locked")).toBeInTheDocument();
    await user.click(
      within(screen.getByRole("navigation", { name: "Occurrences" })).getByRole("button", {
        name: "Next",
      }),
    );
    expect(stringGroupMembers).toHaveBeenLastCalledWith(
      "acme",
      "p1",
      GROUP.id,
      expect.objectContaining({
        offset: 25,
        limit: 25,
        sourcePaths: "a.json,menu.json",
        targetLocale: "fr",
        groupSourceText: GROUP.sourceText,
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(stringGroups).toHaveBeenCalledTimes(1);
    await user.click(
      within(screen.getByRole("navigation", { name: "Group identical strings" })).getByRole(
        "button",
        { name: "Next" },
      ),
    );
    expect(stringGroups).toHaveBeenLastCalledWith(
      "acme",
      "p1",
      expect.objectContaining({ offset: 25 }),
      expect.anything(),
    );
    expect(screen.queryByText("menu.save")).not.toBeInTheDocument();
  });

  it("shows a recoverable member loading error", async () => {
    const { stringGroupMembers, user } = setup();
    stringGroupMembers.mockRejectedValue(new Error("offline"));
    await user.click(await screen.findByRole("button", { name: /Save 80 occurrences/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load strings.");
    stringGroupMembers.mockResolvedValue({
      members: [],
      pagination: { ...PAGE, totalCount: 0, returnedCount: 0, hasMore: false },
    });
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(stringGroupMembers).toHaveBeenCalledTimes(2);
  });
});
