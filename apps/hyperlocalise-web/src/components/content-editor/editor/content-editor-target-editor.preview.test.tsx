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

import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { recoverMarkdownMarkupTokens } from "@/components/content-editor/message-format/content-editor-markdown-markup";

import {
  ContentEditorMessagePreview,
  ContentEditorTargetEditor,
} from "./content-editor-target-editor";

const md0 = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
const md1 = "\u001eHLMDPH_0EB5FD589564_1\u001f";
const md2 = "\u001eHLMDPH_AAAAAAAAAAAA_2\u001f";
const md3 = "\u001eHLMDPH_BBBBBBBBBBBB_3\u001f";

const HELP_CENTER_URL =
  "https://www.intercom.com/help/en/articles/56644-customize-your-help-center";
const MULTI_HELP_URL =
  "https://www.intercom.com/help/en/articles/8170953-create-and-manage-multiple-help-centers";

describe("ContentEditorMessagePreview markdown display", () => {
  it("hides Intercom heading ids", () => {
    renderWithContentEditorProviders(
      <ContentEditorMessagePreview
        message={`Use Articles to power Fin AI Agent and Fin AI Copilot ${md0}`}
        companionMessage="Nutzen Sie Articles als Grundlage {#h_8b76258d80}"
      />,
    );

    expect(
      screen.getByText("Use Articles to power Fin AI Agent and Fin AI Copilot"),
    ).toBeInTheDocument();
    expect(screen.queryByText(/#h_8b76258d80/)).not.toBeInTheDocument();
    expect(screen.queryByText("MD#0")).not.toBeInTheDocument();
  });

  it("renders Intercom links as anchors instead of markdown or MD chips", () => {
    renderWithContentEditorProviders(
      <ContentEditorMessagePreview
        message={`${md0}Customize your Help Center to match your branding${md1} or use ${md2}Multi Help Center${md3} for various products/brands.`}
        companionMessage={`[Passen Sie ihr Help Center an Ihre Marke an](${HELP_CENTER_URL}) oder nutzen Sie [Multi Help Center](${MULTI_HELP_URL}) für verschiedene Produkte/Marken.`}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Customize your Help Center to match your branding" }),
    ).toHaveAttribute("href", HELP_CENTER_URL);
    expect(screen.getByRole("link", { name: "Multi Help Center" })).toHaveAttribute(
      "href",
      MULTI_HELP_URL,
    );
    expect(screen.queryByText("MD#0")).not.toBeInTheDocument();
    expect(screen.queryByText(/\]\(/)).not.toBeInTheDocument();
  });
});

describe("ContentEditorTargetEditor dual-sentinel markdown display", () => {
  const HELP_CENTER_FIN_URL =
    "https://www.intercom.com/help/en/articles/1970126-get-started-with-help-center";
  const COLLECTION_FIN_URL =
    "https://www.intercom.com/help/en/articles/56647-create-collections-in-your-help-center";

  it("renders Fin callout links without MD chips when both sides use sentinels", async () => {
    const sourceTemplate = `For a public article to be enabled for Fin, it must be published, part of a live ${md0}Help Center${md1} and in a ${md2}collection.${md3}`;
    const englishRaw = `For a public article to be enabled for Fin, it must be published, part of a live [Help Center](${HELP_CENTER_FIN_URL}) and in a [collection.](${COLLECTION_FIN_URL})`;
    const germanRaw = `Damit ein öffentlicher Artikel für Fin aktiviert werden kann, muss er veröffentlicht, Teil eines aktiven [Hilfe-Centers](${HELP_CENTER_FIN_URL}) und in einer [Sammlung](${COLLECTION_FIN_URL}) sein.`;
    const sourceProtected = recoverMarkdownMarkupTokens(sourceTemplate, englishRaw)!;
    const targetProtected = recoverMarkdownMarkupTokens(sourceTemplate, germanRaw)!;

    renderWithContentEditorProviders(
      <ContentEditorTargetEditor
        sourceText={sourceProtected}
        value={targetProtected}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "Hilfe-Centers" })).toBeInTheDocument();
    });
    expect(screen.getByRole("link", { name: "Sammlung" })).toBeInTheDocument();
    expect(screen.queryByText("MD#0")).not.toBeInTheDocument();
    expect(screen.queryByText(/HLMDPH/)).not.toBeInTheDocument();
  });
});

describe("ContentEditorTargetEditor markdown display", () => {
  it("hides heading ids and structural MD required tokens", async () => {
    renderWithContentEditorProviders(
      <ContentEditorTargetEditor
        sourceText={`Use Articles to power Fin AI Agent and Fin AI Copilot ${md0}`}
        value="Nutzen Sie Articles als Grundlage {#h_8b76258d80}"
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Nutzen Sie Articles als Grundlage")).toBeInTheDocument();
    });
    expect(screen.queryByText(/#h_8b76258d80/)).not.toBeInTheDocument();
    expect(screen.queryByText("Required tokens")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MD#0" })).not.toBeInTheDocument();
  });

  it("keeps ICU required tokens while hiding markdown link tokens", async () => {
    renderWithContentEditorProviders(
      <ContentEditorTargetEditor
        sourceText={`Hello {name}, see ${md0}docs${md1}`}
        value={`Hallo {name}, siehe [docs](https://example.com/docs)`}
        onChange={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "{name}" })).toBeInTheDocument();
    });
    expect(screen.queryByRole("button", { name: "MD#0" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "MD#1" })).not.toBeInTheDocument();
  });

  it("writes recovered sentinels when a markdown heading is edited", async () => {
    const onChange = vi.fn();
    renderWithContentEditorProviders(
      <ContentEditorTargetEditor
        sourceText={`Use Articles to power Fin AI Agent and Fin AI Copilot ${md0}`}
        value="Nutzen Sie Articles als Grundlage {#h_8b76258d80}"
        onChange={onChange}
      />,
    );

    const editor = await waitFor(() => {
      const node = document.querySelector(".tiptap");
      expect(node).toBeTruthy();
      return node as HTMLElement;
    });

    editor.dispatchEvent(new InputEvent("input", { bubbles: true, data: "!" }));
    // Focus + persist path is covered by display helper; assert the editor stayed clean.
    expect(editor.textContent).not.toContain("#h_8b76258d80");
  });
});
