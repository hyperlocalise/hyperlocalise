"use client";

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
import { defineMessages } from "react-intl";

export const documentEditorMessages = defineMessages({
  placeholder: {
    defaultMessage: "Write, or press / for commands",
    id: "G/cuKsdPte",
    description: "Document editor: placeholder for an empty block",
  },
  addBlock: {
    defaultMessage: "Add a block below",
    id: "/Xo8nQrLMv",
    description: "Document editor: block handle button that inserts a block",
  },
  blockMenu: {
    defaultMessage: "Drag to move, or click for options",
    id: "dxDx5Dgurr",
    description: "Document editor: block drag handle label",
  },
  turnInto: {
    defaultMessage: "Turn into",
    id: "g1CfTAzEW8",
    description: "Document editor: block menu group for changing block type",
  },
  duplicate: {
    defaultMessage: "Duplicate",
    id: "OiFub+Q+VA",
    description: "Document editor: block menu action",
  },
  delete: {
    defaultMessage: "Delete",
    id: "/kslTDjJkg",
    description: "Document editor: block menu action",
  },
  translateBlock: {
    defaultMessage: "Translate block",
    id: "uE2ix++ifY",
    description: "Document editor: action that drafts an AI translation for one block",
  },
  blockText: {
    defaultMessage: "Text",
    id: "PSWLHzvKF9",
    description: "Document editor: paragraph block type",
  },
  blockHeading1: {
    defaultMessage: "Heading 1",
    id: "0qIbYrqvNR",
    description: "Document editor: block type",
  },
  blockHeading2: {
    defaultMessage: "Heading 2",
    id: "P4A/eg4+zm",
    description: "Document editor: block type",
  },
  blockHeading3: {
    defaultMessage: "Heading 3",
    id: "QONRkj5o8h",
    description: "Document editor: block type",
  },
  blockBulletList: {
    defaultMessage: "Bulleted list",
    id: "RdJ/7jnqpq",
    description: "Document editor: block type",
  },
  blockOrderedList: {
    defaultMessage: "Numbered list",
    id: "2pYLMiqFxT",
    description: "Document editor: block type",
  },
  blockTaskList: {
    defaultMessage: "To-do list",
    id: "Idj92WBPuC",
    description: "Document editor: block type",
  },
  blockQuote: {
    defaultMessage: "Quote",
    id: "++gZhhUCZA",
    description: "Document editor: block type",
  },
  blockCode: {
    defaultMessage: "Code",
    id: "InvanO3f/L",
    description: "Document editor: code block type",
  },
  blockCallout: {
    defaultMessage: "Callout",
    id: "GgcJD1DYC4",
    description: "Document editor: highlighted note block type",
  },
  blockTable: {
    defaultMessage: "Table",
    id: "c1bHcKNVvJ",
    description: "Document editor: block type",
  },
  blockDivider: {
    defaultMessage: "Divider",
    id: "4+eIOwonN4",
    description: "Document editor: horizontal rule block type",
  },
  blockTypePicker: {
    defaultMessage: "Change block type",
    id: "nPdoL9UYCJ",
    description: "Document editor: selection toolbar block type menu label",
  },
  bold: {
    defaultMessage: "Bold",
    id: "PaaCBrDQbg",
    description: "Document editor: toolbar action",
  },
  italic: {
    defaultMessage: "Italic",
    id: "d1v6vWhP75",
    description: "Document editor: toolbar action",
  },
  strike: {
    defaultMessage: "Strikethrough",
    id: "xcixo4Kx+Z",
    description: "Document editor: toolbar action",
  },
  inlineCode: {
    defaultMessage: "Inline code",
    id: "5AIDNLOqtS",
    description: "Document editor: toolbar action",
  },
  link: {
    defaultMessage: "Link",
    id: "0Qf9JTzYk1",
    description: "Document editor: toolbar action",
  },
  linkPrompt: {
    defaultMessage: "Link URL",
    id: "I2nwB3YC98",
    description: "Document editor: prompt for a link address",
  },
  addToGlossary: {
    defaultMessage: "Add to glossary",
    id: "QJgGonieS0",
    description: "Document editor: toolbar action that adds the selected term to the glossary",
  },
  slashEmpty: {
    defaultMessage: "No matching blocks",
    id: "UpOzRnLOTf",
    description: "Document editor: slash menu empty state",
  },
  slashGroupBasic: {
    defaultMessage: "Basic blocks",
    id: "ESLUSnFe4V",
    description: "Document editor: slash menu group",
  },
  slashGroupMedia: {
    defaultMessage: "Media",
    id: "UGzxeEmOxQ",
    description: "Document editor: slash menu group",
  },
  slashGroupComponents: {
    defaultMessage: "Components",
    id: "Cts7AbkZpc",
    description: "Document editor: slash menu group",
  },
  slashGroupAi: {
    defaultMessage: "AI",
    id: "0/ut53Dxmd",
    description: "Document editor: slash menu group for AI actions",
  },
  calloutNote: {
    defaultMessage: "Note",
    id: "37SGIX021g",
    description: "Document editor: callout kind",
  },
  calloutTip: {
    defaultMessage: "Tip",
    id: "UomJJ20EuB",
    description: "Document editor: callout kind",
  },
  calloutImportant: {
    defaultMessage: "Important",
    id: "tdTgipYzUU",
    description: "Document editor: callout kind",
  },
  calloutWarning: {
    defaultMessage: "Warning",
    id: "AB+BNzkQF0",
    description: "Document editor: callout kind",
  },
  calloutCaution: {
    defaultMessage: "Caution",
    id: "Ik7unyL5Nw",
    description: "Document editor: callout kind",
  },
  mdxProperties: {
    defaultMessage: "Properties",
    id: "Pn+G9vzgVQ",
    description: "Document editor: button that edits an MDX component's text properties",
  },
  mdxNoProperties: {
    defaultMessage: "This component has no text properties to translate.",
    id: "S7HSqkwHTD",
    description: "Document editor: empty state for MDX component properties",
  },
  mdxLocked: {
    defaultMessage: "MDX code, kept as written",
    id: "KcOHml/Q0u",
    description: "Document editor: label for MDX source that cannot be edited in the page view",
  },
  mdxEditSource: {
    defaultMessage: "Edit source",
    id: "YMhavnBlTh",
    description: "Document editor: action that edits raw MDX source",
  },
  mdxSave: {
    defaultMessage: "Apply",
    id: "/h0YnXent+",
    description: "Document editor: applies an edit to MDX source",
  },
  outline: {
    defaultMessage: "Table of contents",
    id: "jVhCe4mzPA",
    description: "Document editor: outline control label",
  },
  outlineUntranslated: {
    defaultMessage: "Has untranslated blocks",
    id: "K2MFUptMFT",
    description: "Document editor: outline status for a section",
  },
  suggestionAccept: {
    defaultMessage: "Accept",
    id: "Zo2B+NCYIa",
    description: "Document editor: accepts one AI suggestion",
  },
  suggestionReject: {
    defaultMessage: "Reject",
    id: "WLihKcV3Tf",
    description: "Document editor: rejects one AI suggestion",
  },
  suggestionOutdated: {
    defaultMessage: "Outdated: the block was edited",
    id: "V/SEEmqknk",
    description: "Document editor: AI suggestion whose block changed after it was made",
  },
  suggestionCount: {
    defaultMessage: "{count, plural, one {# suggestion} other {# suggestions}}",
    id: "88ELfEIh9P",
    description: "Document editor: number of pending AI suggestions",
  },
  acceptAll: {
    defaultMessage: "Accept all",
    id: "NiyNTdRSf+",
    description: "Document editor: accepts every pending AI suggestion",
  },
  rejectAll: {
    defaultMessage: "Reject all",
    id: "akpZtaynbs",
    description: "Document editor: rejects every AI suggestion",
  },
  previousSuggestion: {
    defaultMessage: "Previous suggestion",
    id: "vaMfx7eOmi",
    description: "Document editor: moves to the previous AI suggestion",
  },
  nextSuggestion: {
    defaultMessage: "Next suggestion",
    id: "uj5l8xhwA9",
    description: "Document editor: moves to the next AI suggestion",
  },
  statusSaving: {
    defaultMessage: "Saving…",
    id: "wp2BMLIVDu",
    description: "Document editor: autosave in progress",
  },
  statusSaved: {
    defaultMessage: "Saved",
    id: "JAndr5j6uF",
    description: "Document editor: autosave finished",
  },
  statusSavedAt: {
    defaultMessage: "Saved {time}",
    id: "pEkSj87lyM",
    description: "Document editor: autosave finished, with a relative time such as 2 minutes ago",
  },
  statusUnsaved: {
    defaultMessage: "Unsaved changes",
    id: "1wGV6xVBJr",
    description: "Document editor: edits not yet saved",
  },
  statusFailed: {
    defaultMessage: "Couldn't save",
    id: "MBQK5dn3By",
    description: "Document editor: autosave failed",
  },
  retry: {
    defaultMessage: "Retry",
    id: "a1RzpD5r0+",
    description: "Document editor: retries a save",
  },
  splitView: {
    defaultMessage: "Show source side by side",
    id: "gkMCgXHGV4",
    description: "Document editor: toggles the source page beside the translation",
  },
  assistant: {
    defaultMessage: "Assistant",
    id: "B7By52E26k",
    description: "Document editor: toggles the translation assistant panel",
  },
  translateDocument: {
    defaultMessage: "Translate document",
    id: "/aZHpwKK+I",
    description: "Document editor: drafts AI translations for the whole document",
  },
  viewCode: {
    defaultMessage: "View code",
    id: "dTNsUTceB4",
    description: "Document editor: switches to raw Markdown",
  },
  viewDocument: {
    defaultMessage: "View document",
    id: "2D+3BSxBcl",
    description: "Document editor: switches from raw Markdown back to the page view",
  },
  codeAria: {
    defaultMessage: "Document source",
    id: "q7SCM1n6xp",
    description: "Document editor: raw Markdown text area label",
  },
  parseFallback: {
    defaultMessage:
      "This file has MDX the page view can't read safely, so it opened as code to avoid changing it.",
    id: "a/00MN41ob",
    description: "Document editor: banner when an MDX file falls back to raw source",
  },
  saveAbandoned: {
    defaultMessage: "Couldn't save this document. Reopen it to retry.",
    id: "EMCGlDDOh2",
    description: "Document editor: toast when a save started by leaving the file fails",
  },
  reviewPendingSuggestions: {
    defaultMessage:
      "Accept or reject translation drafts before review. They are not in the saved file yet.",
    id: "AASd53A8wJ",
    description: "Document editor: warning that unaccepted AI drafts block review",
  },
  sourceTitle: {
    defaultMessage: "Source",
    id: "6aJpnN3sMC",
    description: "Document editor: heading for the read-only source page",
  },
  translateDialogDescription: {
    defaultMessage:
      "AI drafts a translation for each block. Drafts appear as suggestions, and nothing changes until you accept them.",
    id: "Ap20zmqiKe",
    description: "Document editor: translate document dialog description",
  },
  translateScopeUntranslated: {
    defaultMessage: "Untranslated blocks only ({count})",
    id: "oEaoXLpxDB",
    description: "Document editor: translate document scope option",
  },
  translateScopeAll: {
    defaultMessage: "All blocks ({count})",
    id: "0XBfFTiQt3",
    description: "Document editor: translate document scope option",
  },
  translateInstructions: {
    defaultMessage: "Instructions (optional)",
    id: "3dEZlMOBj9",
    description: "Document editor: label for extra AI instructions",
  },
  translateStart: {
    defaultMessage: "Translate",
    id: "vUp2UKH4JW",
    description: "Document editor: starts translating the document",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "UBjBGu6kGh",
    description: "Document editor: closes a dialog",
  },
  translateProgress: {
    defaultMessage: "Translating {done} of {total}…",
    id: "d8ge/A9KIW",
    description: "Document editor: translate document progress",
  },
  translateStop: {
    defaultMessage: "Stop",
    id: "yXy1wWcYG6",
    description: "Document editor: stops translating the document",
  },
  translateNothing: {
    defaultMessage: "There are no blocks to translate.",
    id: "V1UeldRHjR",
    description: "Document editor: translate document with an empty scope",
  },
  translateFailed: {
    defaultMessage:
      "{count, plural, one {# block couldn't be translated.} other {# blocks couldn't be translated.}}",
    id: "u/GyZps3MY",
    description: "Document editor: some blocks failed during translate document",
  },
  assistantEmpty: {
    defaultMessage: "Put the cursor in a block to see its source, matches, and terms.",
    id: "tAcLh3kaGY",
    description: "Document editor: assistant panel when no block is focused",
  },
  assistantClose: {
    defaultMessage: "Close assistant",
    id: "dwl+X67Kqo",
    description: "Document editor: closes the assistant panel",
  },
  assistantNoSource: {
    defaultMessage: "No matching source block. The structure differs here.",
    id: "6RdOnlakN3",
    description: "Document editor: assistant when the focused block has no aligned source",
  },
  assistantAi: {
    defaultMessage: "AI suggestion",
    id: "QJzxM6hpei",
    description: "Document editor: assistant section heading",
  },
  assistantTm: {
    defaultMessage: "Translation memory",
    id: "Eu4jO4f/FN",
    description: "Document editor: assistant section heading",
  },
  assistantGlossary: {
    defaultMessage: "Glossary",
    id: "bPblegqbiB",
    description: "Document editor: assistant section heading",
  },
  assistantConcordance: {
    defaultMessage: "Concordance search",
    id: "zCGS1KGzqn",
    description: "Document editor: assistant section heading",
  },
  assistantConcordancePlaceholder: {
    defaultMessage: "Search a phrase",
    id: "SYif6eHng+",
    description: "Document editor: concordance search input placeholder",
  },
  assistantInsert: {
    defaultMessage: "Insert",
    id: "1hrYrZe2IQ",
    description: "Document editor: replaces the focused block with a suggestion",
  },
  assistantUseSource: {
    defaultMessage: "Copy to block",
    id: "XhiHGfBpQg",
    description: "Document editor: replaces the focused block with its source",
  },
  assistantRegenerate: {
    defaultMessage: "Regenerate",
    id: "KQFbT8uPA5",
    description: "Document editor: asks the AI for a new suggestion",
  },
  assistantNoMatches: {
    defaultMessage: "No matches",
    id: "ped1uAjZHM",
    description: "Document editor: assistant section with no results",
  },
  assistantLoadFailed: {
    defaultMessage: "Couldn't load this section.",
    id: "P/T+1+1UdK",
    description: "Document editor: assistant section failed",
  },
  assistantMatchPercent: {
    defaultMessage: "{percent}%",
    id: "i11VrAgWlc",
    description: "Document editor: translation memory match score",
  },
  glossaryForbidden: {
    defaultMessage: "Forbidden",
    id: "fNehARGcLY",
    description: "Document editor: glossary term that must not be used",
  },
  glossaryMissing: {
    defaultMessage: "Approved term not used",
    id: "ist1vo6g3k",
    description: "Document editor: the block omits an approved glossary translation",
  },
  glossaryUsesForbidden: {
    defaultMessage: "Uses a forbidden term",
    id: "w+mYM2FzF6",
    description: "Document editor: the block uses a forbidden glossary term",
  },
  shortcutHint: {
    defaultMessage: "{shortcut} to toggle",
    id: "xTxrHZIjDK",
    description: "Document editor: keyboard shortcut hint",
  },
});
