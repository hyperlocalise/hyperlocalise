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

import { useState } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";
import type { ContentEditorAdvancedQueueFilter } from "@/lib/projects/content-editor/content-editor-advanced-queue-filter";

import { ContentEditorQueueToolbar } from "./content-editor-queue-toolbar";
import { parseTagSearch } from "./content-editor-tag-search";

vi.mock("@/components/content-editor/project-file/project-file-content-editor-api", () => ({
  fetchProjectFileContentEditorLabels: vi.fn(async () => [
    { id: "checkout", title: "checkout" },
    { id: "release-7", title: "release-7" },
    { id: "release-8", title: "release-8" },
  ]),
}));

describe("parseTagSearch", () => {
  it("takes finished tag: words out of the text and keeps the one being typed apart", () => {
    expect(parseTagSearch("hello tag:release-7 world")).toEqual({
      text: "hello world",
      tags: ["release-7"],
      pending: null,
    });
    expect(parseTagSearch("hello tag:rel")).toEqual({
      text: "hello ",
      tags: [],
      pending: "rel",
    });
    expect(parseTagSearch("tag:")).toEqual({ text: "", tags: [], pending: "" });
    expect(parseTagSearch("price tag")).toEqual({ text: "price tag", tags: [], pending: null });
  });
});

function Harness({
  initialAdvanced,
  providerKind = "native",
  onSearch = vi.fn(),
  onAdvanced = vi.fn(),
  onQueueFilterChange = vi.fn(),
}: {
  initialAdvanced?: ContentEditorAdvancedQueueFilter;
  providerKind?: string | null;
  onSearch?: (value: string) => void;
  onAdvanced?: (filter: ContentEditorAdvancedQueueFilter | undefined) => void;
  onQueueFilterChange?: (filter: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [advanced, setAdvanced] = useState(initialAdvanced);
  return (
    <ContentEditorQueueToolbar
      search={search}
      onSearchChange={(value) => {
        setSearch(value);
        onSearch(value);
      }}
      queueFilter="all"
      onQueueFilterChange={onQueueFilterChange}
      availableQueueFilters={["all", "hidden", "not_hidden"]}
      queueAdvanced={advanced}
      onQueueAdvancedChange={(filter) => {
        setAdvanced(filter);
        onAdvanced(filter);
      }}
      providerKind={providerKind}
      organizationSlug="acme"
      projectId="project-1"
    />
  );
}

describe("tag search in the content editor search box", () => {
  it("turns a finished tag: word into a tag filter chip and keeps the text search", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    const onAdvanced = vi.fn();
    renderWithContentEditorProviders(<Harness onSearch={onSearch} onAdvanced={onAdvanced} />);

    const box = screen.getByRole("combobox", { name: /Search segments/ });
    await user.type(box, "save tag:checkout ");

    expect(onAdvanced).toHaveBeenLastCalledWith({
      includeLabelIds: ["checkout"],
      includeLabelMode: "include_all",
    });
    expect(onSearch).not.toHaveBeenCalledWith(expect.stringContaining("tag:"));
    expect(box).toHaveValue("save ");
    expect(screen.getByRole("group", { name: "Filtered by tags" })).toHaveTextContent("checkout");
  });

  it("suggests the project's tags and picks one with the keyboard", async () => {
    const user = userEvent.setup();
    const onAdvanced = vi.fn();
    renderWithContentEditorProviders(<Harness onAdvanced={onAdvanced} />);

    const box = screen.getByRole("combobox", { name: /Search segments/ });
    await user.type(box, "tag:rel");
    const options = await screen.findAllByRole("option");
    expect(options.map((option) => option.textContent)).toEqual(["release-7", "release-8"]);

    await user.keyboard("{ArrowDown}{Enter}");
    expect(onAdvanced).toHaveBeenLastCalledWith({
      includeLabelIds: ["release-8"],
      includeLabelMode: "include_all",
    });
    expect(box).toHaveValue("");
  });

  it("removes a tag filter from its chip, and a quick filter keeps the tags", async () => {
    const user = userEvent.setup();
    const onAdvanced = vi.fn();
    renderWithContentEditorProviders(
      <Harness
        onAdvanced={onAdvanced}
        initialAdvanced={{
          includeLabelIds: ["checkout", "release-7"],
          includeLabelMode: "include_all",
          stringType: "plain",
        }}
      />,
    );

    // Other advanced filters are set, so the button names the advanced filter.
    expect(screen.getByRole("button", { name: "Filter queue" })).toHaveTextContent(
      "Advanced Filter",
    );
    await user.click(screen.getByRole("button", { name: "Filter queue" }));
    await user.click(screen.getByRole("menuitem", { name: "Hidden" }));
    expect(onAdvanced).toHaveBeenLastCalledWith({
      includeLabelIds: ["checkout", "release-7"],
      includeLabelMode: "include_all",
    });

    await user.click(screen.getByRole("button", { name: "Remove tag filter checkout" }));
    expect(onAdvanced).toHaveBeenLastCalledWith({
      includeLabelIds: ["release-7"],
      includeLabelMode: "include_all",
    });
    await user.click(screen.getByRole("button", { name: "Remove tag filter release-7" }));
    expect(onAdvanced).toHaveBeenLastCalledWith(undefined);
  });

  it("shows chosen tags as pills inside the search box, and Backspace in an empty box removes the last", async () => {
    const user = userEvent.setup();
    const onAdvanced = vi.fn();
    renderWithContentEditorProviders(
      <Harness
        onAdvanced={onAdvanced}
        initialAdvanced={{
          includeLabelIds: ["checkout", "release-7"],
          includeLabelMode: "include_all",
        }}
      />,
    );

    const box = screen.getByRole("combobox", { name: /Search segments/ });
    const pills = screen.getByRole("group", { name: "Filtered by tags" });
    expect(box.closest("[data-slot=input-group]")).toContainElement(pills);

    await user.click(box);
    await user.keyboard("{Backspace}");
    expect(onAdvanced).toHaveBeenLastCalledWith({
      includeLabelIds: ["checkout"],
      includeLabelMode: "include_all",
    });
  });

  it("leaves Crowdin projects' search box as plain text search", async () => {
    const user = userEvent.setup();
    const onSearch = vi.fn();
    renderWithContentEditorProviders(<Harness providerKind="crowdin" onSearch={onSearch} />);

    const box = screen.getByRole("textbox", { name: /Search segments/ });
    await user.type(box, "tag:a ");
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("tag:a "));
  });
});
