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
import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey, type EditorState, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";

import { diffWords } from "./document-editor-word-diff";

export type DocumentSuggestionStatus = "pending" | "outdated";

export type DocumentSuggestion = {
  id: string;
  /** Range of the top-level block the suggestion replaces. */
  from: number;
  to: number;
  /** Block text when the suggestion was made; any edit to it outdates the suggestion. */
  originalText: string;
  replacement: JSONContent[];
  replacementText: string;
  status: DocumentSuggestionStatus;
};

export type DocumentSuggestionLabels = {
  accept: string;
  reject: string;
  outdated: string;
};

type SuggestionsState = { suggestions: DocumentSuggestion[] };

type SuggestionsMeta =
  | { type: "add"; suggestions: DocumentSuggestion[] }
  | { type: "remove"; ids: string[] }
  | { type: "clear" };

export const documentSuggestionsKey = new PluginKey<SuggestionsState>("documentSuggestions");

function blockText(doc: ProseMirrorNode, from: number, to: number) {
  if (from < 0 || to > doc.content.size || from >= to) {
    return null;
  }
  return doc.textBetween(from, to, "\n", "\n");
}

function mapSuggestions(suggestions: DocumentSuggestion[], tr: Transaction) {
  const mapped: DocumentSuggestion[] = [];
  for (const suggestion of suggestions) {
    const from = tr.mapping.mapResult(suggestion.from, 1);
    const to = tr.mapping.mapResult(suggestion.to, -1);
    if (from.deleted && to.deleted) {
      continue;
    }
    const text = blockText(tr.doc, from.pos, to.pos);
    if (text === null) {
      continue;
    }
    mapped.push({
      ...suggestion,
      from: from.pos,
      to: to.pos,
      status: text === suggestion.originalText ? suggestion.status : "outdated",
    });
  }
  return mapped;
}

function applyMeta(state: SuggestionsState, meta: SuggestionsMeta): SuggestionsState {
  switch (meta.type) {
    case "add": {
      const replaced = new Set(meta.suggestions.map((suggestion) => suggestion.from));
      return {
        suggestions: [
          ...state.suggestions.filter((suggestion) => !replaced.has(suggestion.from)),
          ...meta.suggestions,
        ].toSorted((a, b) => a.from - b.from),
      };
    }
    case "remove": {
      const ids = new Set(meta.ids);
      return { suggestions: state.suggestions.filter((suggestion) => !ids.has(suggestion.id)) };
    }
    case "clear":
      return { suggestions: [] };
  }
}

export function getDocumentSuggestions(state: EditorState): DocumentSuggestion[] {
  return documentSuggestionsKey.getState(state)?.suggestions ?? [];
}

function replaceSuggestion(tr: Transaction, suggestion: DocumentSuggestion) {
  const nodes = suggestion.replacement.map((json) => tr.doc.type.schema.nodeFromJSON(json));
  tr.replaceWith(suggestion.from, suggestion.to, nodes);
}

function acceptInView(view: EditorView, ids: string[]) {
  const wanted = new Set(ids);
  const accepted = getDocumentSuggestions(view.state)
    .filter((suggestion) => wanted.has(suggestion.id) && suggestion.status === "pending")
    .toSorted((a, b) => b.from - a.from);
  if (accepted.length === 0) {
    return false;
  }
  const tr = view.state.tr;
  for (const suggestion of accepted) {
    replaceSuggestion(tr, suggestion);
  }
  tr.setMeta(documentSuggestionsKey, {
    type: "remove",
    ids: accepted.map((suggestion) => suggestion.id),
  } satisfies SuggestionsMeta);
  view.dispatch(tr);
  return true;
}

function rejectInView(view: EditorView, ids: string[]) {
  view.dispatch(
    view.state.tr
      .setMeta(documentSuggestionsKey, { type: "remove", ids } satisfies SuggestionsMeta)
      .setMeta("addToHistory", false),
  );
}

export function addDocumentSuggestions(editor: Editor, suggestions: DocumentSuggestion[]) {
  editor.view.dispatch(
    editor.state.tr
      .setMeta(documentSuggestionsKey, { type: "add", suggestions } satisfies SuggestionsMeta)
      .setMeta("addToHistory", false),
  );
}

export function acceptDocumentSuggestions(editor: Editor, ids: string[]) {
  return acceptInView(editor.view, ids);
}

export function rejectDocumentSuggestions(editor: Editor, ids: string[]) {
  rejectInView(editor.view, ids);
}

export function clearDocumentSuggestions(editor: Editor) {
  editor.view.dispatch(
    editor.state.tr
      .setMeta(documentSuggestionsKey, { type: "clear" } satisfies SuggestionsMeta)
      .setMeta("addToHistory", false),
  );
}

function renderSuggestionWidget(
  suggestion: DocumentSuggestion,
  labels: DocumentSuggestionLabels,
): (view: EditorView) => HTMLElement {
  return (view) => {
    const card = document.createElement("div");
    card.className = "document-suggestion-card";
    card.contentEditable = "false";
    card.dataset.suggestionId = suggestion.id;
    card.dataset.status = suggestion.status;

    const diff = document.createElement("div");
    diff.className = "document-suggestion-diff";
    for (const part of diffWords(suggestion.originalText, suggestion.replacementText)) {
      const span = document.createElement(
        part.kind === "added" ? "ins" : part.kind === "removed" ? "del" : "span",
      );
      span.textContent = part.text;
      diff.append(span);
    }
    card.append(diff);

    const actions = document.createElement("div");
    actions.className = "document-suggestion-actions";
    if (suggestion.status === "outdated") {
      const note = document.createElement("span");
      note.className = "document-suggestion-outdated";
      note.textContent = labels.outdated;
      actions.append(note);
    } else {
      const accept = document.createElement("button");
      accept.type = "button";
      accept.dataset.action = "accept";
      accept.textContent = labels.accept;
      accept.addEventListener("mousedown", (event) => event.preventDefault());
      accept.addEventListener("click", () => acceptInView(view, [suggestion.id]));
      actions.append(accept);
    }
    const reject = document.createElement("button");
    reject.type = "button";
    reject.dataset.action = "reject";
    reject.textContent = labels.reject;
    reject.addEventListener("mousedown", (event) => event.preventDefault());
    reject.addEventListener("click", () => rejectInView(view, [suggestion.id]));
    actions.append(reject);
    card.append(actions);
    return card;
  };
}

/**
 * Per-block AI suggestions kept in plugin state and drawn as decorations, so
 * they never reach the saved Markdown until accepted.
 */
export const DocumentSuggestions = Extension.create<{
  getLabels: () => DocumentSuggestionLabels;
}>({
  name: "documentSuggestions",

  addOptions() {
    return {
      getLabels: () => ({ accept: "Accept", reject: "Reject", outdated: "Outdated" }),
    };
  },

  addProseMirrorPlugins() {
    const getLabels = this.options.getLabels;
    return [
      new Plugin<SuggestionsState>({
        key: documentSuggestionsKey,
        state: {
          init: () => ({ suggestions: [] }),
          apply(tr, value) {
            let next = value;
            if (tr.docChanged && next.suggestions.length > 0) {
              next = { suggestions: mapSuggestions(next.suggestions, tr) };
            }
            const meta = tr.getMeta(documentSuggestionsKey) as SuggestionsMeta | undefined;
            return meta ? applyMeta(next, meta) : next;
          },
        },
        props: {
          decorations(state) {
            const suggestions = getDocumentSuggestions(state);
            if (suggestions.length === 0) {
              return DecorationSet.empty;
            }
            const labels = getLabels();
            return DecorationSet.create(
              state.doc,
              suggestions.flatMap((suggestion) => [
                Decoration.node(suggestion.from, suggestion.to, {
                  class: "document-suggestion-target",
                  "data-suggestion-status": suggestion.status,
                }),
                Decoration.widget(suggestion.to, renderSuggestionWidget(suggestion, labels), {
                  side: 1,
                  key: `${suggestion.id}:${suggestion.status}`,
                  ignoreSelection: true,
                  stopEvent: () => true,
                }),
              ]),
            );
          },
        },
      }),
    ];
  },
});
