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

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { ContentEditorTestProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorHtmlEditorPane } from "./content-editor-html-editor-pane";

describe("ContentEditorHtmlEditorPane", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("previews source and target HTML in file view", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("source")) {
          return new Response("<table><tr><td>Source cell</td></tr></table>");
        }
        return new Response("<table><tr><td>Target cell</td></tr></table>");
      }),
    );

    render(
      <ContentEditorTestProviders>
        <ContentEditorHtmlEditorPane
          documentKey="html-1:fr"
          sourceSrc="https://example.com/source.html"
          targetSrc="https://example.com/target.html"
          filename="page.html"
          sourceLocale="en"
          targetLocale="fr"
          splitView
        />
      </ContentEditorTestProviders>,
    );

    const source = await screen.findByTitle("Source (en)");
    const target = screen.getByTitle("Translated (fr)");
    expect(source).toHaveAttribute("srcdoc", "<table><tr><td>Source cell</td></tr></table>");
    expect(target).toHaveAttribute("srcdoc", "<table><tr><td>Target cell</td></tr></table>");
  });

  it("switches to code editing and blocks review while dirty", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<p>Hello</p>")),
    );
    const onReviewBlockedChange = vi.fn();

    render(
      <ContentEditorTestProviders>
        <ContentEditorHtmlEditorPane
          documentKey="html-2:fr"
          sourceSrc="https://example.com/source.html"
          targetSrc="https://example.com/target.html"
          filename="page.html"
          sourceLocale="en"
          targetLocale="fr"
          onSave={vi.fn()}
          onReviewBlockedChange={onReviewBlockedChange}
        />
      </ContentEditorTestProviders>,
    );

    await screen.findByTitle("Translated (fr)");
    await user.click(screen.getByRole("button", { name: "View code" }));
    const editor = screen.getByLabelText("Translated (fr)");
    expect(editor).toHaveValue("<p>Hello</p>");
    await user.clear(editor);
    await user.paste("<p>Bonjour</p>");
    expect(editor).toHaveValue("<p>Bonjour</p>");
    expect(onReviewBlockedChange).toHaveBeenCalledWith(true);
  });

  it("reloads the target when an external targetSrc change arrives", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("source")) {
        return new Response("<p>Hello</p>");
      }
      if (url.includes("generated")) {
        return new Response("<p>Bonjour</p>");
      }
      return new Response("<p>Hello</p>");
    });
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = render(
      <ContentEditorTestProviders>
        <ContentEditorHtmlEditorPane
          documentKey="html-3:fr"
          sourceSrc="https://example.com/source.html"
          targetSrc="https://example.com/target.html"
          filename="page.html"
          sourceLocale="en"
          targetLocale="fr"
        />
      </ContentEditorTestProviders>,
    );

    await screen.findByTitle("Translated (fr)");
    expect(screen.getByTitle("Translated (fr)")).toHaveAttribute("srcdoc", "<p>Hello</p>");

    rerender(
      <ContentEditorTestProviders>
        <ContentEditorHtmlEditorPane
          documentKey="html-3:fr"
          sourceSrc="https://example.com/source.html"
          targetSrc="https://example.com/generated.html"
          filename="page.html"
          sourceLocale="en"
          targetLocale="fr"
        />
      </ContentEditorTestProviders>,
    );

    await waitFor(() => {
      expect(screen.getByTitle("Translated (fr)")).toHaveAttribute("srcdoc", "<p>Bonjour</p>");
    });
  });
});
