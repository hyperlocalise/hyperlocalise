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

export const contentEditorKeyTranslateDialogMessages = defineMessages({
  title: {
    defaultMessage: "Translate with AI",
    id: "qGUa5mCUGt",
    description: "Title of the dialog that translates the ticked strings with AI",
  },
  description: {
    defaultMessage:
      "{count, plural, one {The ticked string is} other {The # ticked strings are}} translated with AI in the background. Results need review. Approved translations, locked strings and hidden strings are left as they are.",
    id: "ogYglCWKZA",
    description: "Explains what AI translation does with the ticked strings",
  },
  languages: {
    defaultMessage: "Languages",
    id: "mR9wHdhxYi",
    description: "Label of the languages to translate the ticked strings into",
  },
  overwriteUnapproved: {
    defaultMessage: "Also replace translations that are not approved yet",
    id: "sdQvRHgv8W",
    description:
      "Option to let AI translation replace existing translations that are not approved; by default it fills only missing ones",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "M7LBHZr6HO",
    description: "Closes the AI translation dialog without starting anything",
  },
  translate: {
    defaultMessage: "Translate",
    id: "oa50ttNK+t",
    description: "Starts AI translation of the ticked strings",
  },
  jobTitle: {
    defaultMessage: "AI translation of {count, plural, one {# string} other {# strings}}",
    id: "VYNLQ4kVv7",
    description: "Title given to the job that translates the ticked strings with AI",
  },
  started: {
    defaultMessage:
      "Translating {count, plural, one {# string} other {# strings}}. They update as each one finishes.",
    id: "eeNMn0N1Hc",
    description: "Toast after AI translation of the ticked strings starts",
  },
  openJob: {
    defaultMessage: "Open job",
    id: "XPVACICrP4",
    description: "Toast action that opens the AI translation job's page",
  },
  failed: {
    defaultMessage: "AI translation could not be started",
    id: "bj4SaG8kZ2",
    description: "Fallback error when starting AI translation of the ticked strings fails",
  },
});
