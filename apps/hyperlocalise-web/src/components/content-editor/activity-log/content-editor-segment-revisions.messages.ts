"use client";

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
import { defineMessages } from "react-intl";

export const contentEditorSegmentRevisionsMessages = defineMessages({
  title: {
    defaultMessage: "Versions",
    id: "BKxL4swmsj",
    description: "Heading for the saved versions of a translation in the activity panel",
  },
  loading: {
    defaultMessage: "Loading versions…",
    id: "HQCsRSZ/jP",
    description: "Shown while the saved versions of a translation load",
  },
  loadError: {
    defaultMessage: "Versions could not be loaded.",
    id: "KCT9updWm9",
    description: "Shown when the saved versions of a translation fail to load",
  },
  retry: {
    defaultMessage: "Retry",
    id: "Q+YXRpX0lR",
    description: "Button that loads the saved versions of a translation again",
  },
  empty: {
    defaultMessage: "No saved versions yet. Versions are kept from the next save onward.",
    id: "fXzaom8Uje",
    description: "Shown when a translation has no saved versions",
  },
  loadMore: {
    defaultMessage: "Older versions",
    id: "Fza3LrdNjW",
    description: "Button that loads older saved versions of a translation",
  },
  current: {
    defaultMessage: "Current",
    id: "5PujJrZ8+Q",
    description: "Badge on the version a translation holds now",
  },
  emptyText: {
    defaultMessage: "No translation",
    id: "3UkcudWLuJ",
    description: "Shown in place of the text of a version that has no translation",
  },
  byHuman: {
    defaultMessage: "Human",
    id: "KPMvXBlGyG",
    description: "Badge on a version a person saved",
  },
  byAi: {
    defaultMessage: "AI",
    id: "0hgPMmB3pR",
    description: "Badge on a version an AI agent saved",
  },
  byApiKey: {
    defaultMessage: "API key",
    id: "0XdWtvKU5+",
    description: "Badge on a change made with an API key",
  },
  byJob: {
    defaultMessage: "Translation job",
    id: "SaAhfbpg4G",
    description: "Badge on a version a translation job wrote",
  },
  byImport: {
    defaultMessage: "Import",
    id: "Byx9p4Jzwx",
    description: "Badge on a version written by a translation file import",
  },
  bySystem: {
    defaultMessage: "System",
    id: "7oD6FrbZ/1",
    description: "Badge on a version written by an automatic process",
  },
  restoredLabel: {
    defaultMessage: "Restored from an earlier version",
    id: "6Cs/mEyRBM",
    description: "Note on a version that put back an earlier version",
  },
  undoneLabel: {
    defaultMessage: "Written by an undo",
    id: "rCir8wqkPX",
    description: "Note on a version written when someone undid an operation",
  },
  restore: {
    defaultMessage: "Restore this version",
    id: "d6KTrf9M6t",
    description: "Button that puts back an earlier version of a translation",
  },
  restoring: {
    defaultMessage: "Restoring…",
    id: "NPC+HNEkmS",
    description: "Restore button label while the restore is saving",
  },
  restored: {
    defaultMessage: "Version restored.",
    id: "ifCgEWtzX/",
    description: "Toast after an earlier version of a translation is put back",
  },
  restoreConflict: {
    defaultMessage:
      "The translation changed since you opened it. Check the latest version and try again.",
    id: "OpB2i3IEeF",
    description: "Toast when a restore is refused because someone saved a newer version",
  },
  restoreLocked: {
    defaultMessage: "This string is locked, so it can't be restored.",
    id: "IiGIsIulPY",
    description: "Toast when a restore is refused because the string is locked",
  },
  restoreFailed: {
    defaultMessage: "The version could not be restored.",
    id: "4Jz0LdypFu",
    description: "Toast when restoring a version fails",
  },
  undo: {
    defaultMessage: "Undo this change everywhere",
    id: "Zb22wxn7AC",
    description: "Button that reverts every string changed by the same save, job or import",
  },
  undoTitle: {
    defaultMessage: "Undo this change?",
    id: "3+8Uc1x711",
    description: "Title of the dialog confirming an undo of a whole operation",
  },
  undoDescription: {
    defaultMessage:
      "Every string this save, job or import changed goes back to its earlier version. Strings edited or locked since are left as they are.",
    id: "1QYMtpg2la",
    description: "Body of the dialog confirming an undo of a whole operation",
  },
  undoConfirm: {
    defaultMessage: "Undo",
    id: "H1mHG3+GcH",
    description: "Confirm button in the undo dialog",
  },
  undoCancel: {
    defaultMessage: "Cancel",
    id: "Y6NpL+kok1",
    description: "Cancel button in the undo dialog",
  },
  undoDone: {
    defaultMessage: "{count, plural, one {# string reverted.} other {# strings reverted.}}",
    id: "fqWM4WHCZ9",
    description: "Toast after undoing an operation, with how many strings were reverted",
  },
  undoSkipped: {
    defaultMessage:
      "{count, plural, one {# string was left as it is because it changed or is locked.} other {# strings were left as they are because they changed or are locked.}}",
    id: "GKZwvqmB92",
    description: "Second line of the undo toast, with how many strings were not reverted",
  },
  undoTooLarge: {
    defaultMessage: "This change touched too many strings to undo at once.",
    id: "+TJHvPmpRP",
    description: "Toast when an operation is too large to undo",
  },
  undoFailed: {
    defaultMessage: "The change could not be undone.",
    id: "Z6yIjKdK2x",
    description: "Toast when undoing an operation fails",
  },
});
