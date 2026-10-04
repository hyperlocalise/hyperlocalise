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
import { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it } from "vite-plus/test";

import { documentBlocksFromJson } from "./document-editor-blocks";
import {
  createDocumentSchemaExtensions,
  parseDocumentMarkdown,
} from "./document-editor-extensions";
import {
  checkDocumentGlossary,
  glossaryEntryFromTargetSelection,
  glossarySourceTermFromBlock,
} from "./document-editor-glossary";

const term = (id: string, source: string, target: string, forbidden = false) => ({
  id,
  source,
  target,
  approved: !forbidden,
  forbidden,
});

describe("checkDocumentGlossary", () => {
  it("reports missing approved terms and used forbidden terms, worst first", () => {
    const findings = checkDocumentGlossary(
      [
        term("a", "workspace", "espace de travail"),
        term("b", "project", "projet"),
        term("c", "pick", "choisissez", true),
        term("d", "billing", "facturation"),
      ],
      "Open the Workspace and pick a project.",
      "Ouvrez l'espace et choisissez un projet.",
    );

    expect(findings.map((finding) => [finding.term.id, finding.status])).toEqual([
      ["c", "forbidden"],
      ["a", "missing"],
      ["b", "ok"],
    ]);
  });
});

describe("glossarySourceTermFromBlock", () => {
  it("keeps the source spelling when the selection still appears in the source block", () => {
    expect(
      glossarySourceTermFromBlock(
        "Open the Dashboard.",
        "Open the Dashboard to review.",
        "dashboard",
      ),
    ).toBe("Dashboard");
  });

  it("uses the source block when the selection is the whole translated block", () => {
    expect(glossarySourceTermFromBlock("Dashboard", "Tableau de bord", "Tableau de bord")).toBe(
      "Dashboard",
    );
  });

  it("leaves a translated phrase blank", () => {
    expect(
      glossarySourceTermFromBlock(
        "Open the dashboard to review metrics.",
        "Ouvrez le tableau de bord pour revoir les métriques.",
        "tableau de bord",
      ),
    ).toBe("");
  });

  it("does not treat a source substring as the term", () => {
    expect(glossarySourceTermFromBlock("category", "category", "cat")).toBe("");
  });

  it("matches punctuation literally", () => {
    expect(glossarySourceTermFromBlock("Use a+b here", "Use a+b here", "a+b")).toBe("a+b");
  });

  it("leaves the source term blank without a source block", () => {
    expect(glossarySourceTermFromBlock(null, "Bonjour", "Bonjour")).toBe("");
  });
});

const SOURCE = ["# Dashboard", "", "Open the dashboard to review metrics."].join("\n");
const TARGET = [
  "# Tableau de bord",
  "",
  "Ouvrez le tableau de bord pour revoir les métriques.",
].join("\n");

let editor: Editor | undefined;
afterEach(() => editor?.destroy());

function setup(markdown: string) {
  editor = new Editor({
    element: document.createElement("div"),
    extensions: createDocumentSchemaExtensions("markdown"),
    content: markdown,
    contentType: "markdown",
  });
  return editor;
}

function selectText(current: Editor, text: string) {
  let found: { from: number; to: number } | null = null;
  current.state.doc.descendants((node, pos) => {
    if (found || !node.isText || !node.text) return;
    const index = node.text.indexOf(text);
    if (index === -1) return;
    found = { from: pos + index, to: pos + index + text.length };
    return false;
  });
  if (!found) throw new Error(`missing selection ${text}`);
  current.commands.setTextSelection(found);
  const { from, to } = current.state.selection;
  return current.state.doc.textBetween(from, to, " ");
}

describe("glossaryEntryFromTargetSelection", () => {
  it("derives the source term from the aligned block and keeps the target selection", () => {
    const current = setup(TARGET);
    const sourceBlocks = documentBlocksFromJson(parseDocumentMarkdown(SOURCE, "markdown"));
    const selected = selectText(current, "Tableau de bord");

    expect(glossaryEntryFromTargetSelection(current, sourceBlocks, selected)).toEqual({
      sourceTerm: "Dashboard",
      targetTerm: "Tableau de bord",
    });
  });

  it("leaves the source term blank for a phrase inside a translated block", () => {
    const current = setup(TARGET);
    const sourceBlocks = documentBlocksFromJson(parseDocumentMarkdown(SOURCE, "markdown"));
    const selected = selectText(current, "tableau de bord");

    expect(glossaryEntryFromTargetSelection(current, sourceBlocks, selected)).toEqual({
      sourceTerm: "",
      targetTerm: "tableau de bord",
    });
  });

  it("leaves the source term blank when the selection crosses blocks", () => {
    const current = setup(TARGET);
    const sourceBlocks = documentBlocksFromJson(parseDocumentMarkdown(SOURCE, "markdown"));
    selectText(current, "Tableau de bord");
    const phraseFrom = current.state.selection.from;
    selectText(current, "métriques");
    current.commands.setTextSelection({ from: phraseFrom, to: current.state.selection.to });
    const { from, to } = current.state.selection;

    expect(
      glossaryEntryFromTargetSelection(
        current,
        sourceBlocks,
        current.state.doc.textBetween(from, to, " "),
      ),
    ).toMatchObject({ sourceTerm: "" });
  });
});
