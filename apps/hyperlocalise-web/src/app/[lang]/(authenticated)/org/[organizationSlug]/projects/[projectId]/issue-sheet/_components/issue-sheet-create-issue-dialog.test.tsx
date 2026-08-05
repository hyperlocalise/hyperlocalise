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
// @vitest-environment happy-dom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  IssueSheetCreateIssueDialog,
  type IssueSheetCreateStringLink,
} from "./issue-sheet-create-issue-dialog";

vi.mock("@/components/markdown-editor/markdown-editor", () => ({
  MarkdownEditor: ({
    value,
    onChange,
    ariaLabel,
  }: {
    value: string;
    onChange: (next: string) => void;
    ariaLabel?: string;
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      onChange={(event) => onChange(event.currentTarget.value)}
    />
  ),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

function stringLinkFor(segmentId: string): IssueSheetCreateStringLink {
  return {
    translationKeyId: segmentId,
    segmentId,
    sourcePath: "marketing/home.json",
    targetLocale: "fr-FR",
    defaultTitle: `Context needed: ${segmentId}`,
    defaultDescription: "Source text",
    linkUrl: "https://app.test/cat",
    linkLabel: "Open in CAT",
  };
}

// Every render builds a fresh `stringLink` object, matching how CatLinkedIssuesDialog
// rerenders while the create dialog is open (for example when a query resolves).
function dialogTree(segmentId: string, queryClient: QueryClient) {
  return (
    <QueryClientProvider client={queryClient}>
      <IntlProvider locale="en" messages={{}}>
        <IssueSheetCreateIssueDialog
          open
          onOpenChange={() => undefined}
          organizationSlug="acme"
          projectId="proj_1"
          stringLink={stringLinkFor(segmentId)}
          onCreated={async () => undefined}
        />
      </IntlProvider>
    </QueryClientProvider>
  );
}

function renderDialog(segmentId = "segment-1") {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const view = render(dialogTree(segmentId, queryClient));

  return {
    ...view,
    rerenderWith: (nextSegmentId: string) => view.rerender(dialogTree(nextSegmentId, queryClient)),
  };
}

describe("IssueSheetCreateIssueDialog", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ members: [] }), { status: 200 })),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("prefills the form from the string link", () => {
    renderDialog();

    expect(screen.getByLabelText("Title")).toHaveValue("Context needed: segment-1");
    expect(screen.getByLabelText("Locale")).toHaveValue("fr-FR");
    expect(screen.getByLabelText("Source path")).toHaveValue("marketing/home.json");
  });

  it("keeps in-progress edits when the caller rerenders with a new string link object", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderDialog();

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Needs plural context");
    rerenderWith("segment-1");

    expect(screen.getByLabelText("Title")).toHaveValue("Needs plural context");
  });

  it("reinitializes the form when the linked segment changes", async () => {
    const user = userEvent.setup();
    const { rerenderWith } = renderDialog();

    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Needs plural context");
    rerenderWith("segment-2");

    expect(screen.getByLabelText("Title")).toHaveValue("Context needed: segment-2");
  });
});
