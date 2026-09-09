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

export const markdownSelectionAiMessages = defineMessages({
  ask: { defaultMessage: "Ask", id: "s0V8+ZXV3v", description: "Document selection AI: ask" },
  rewrite: {
    defaultMessage: "Rewrite",
    id: "nbgZnaWVzl",
    description: "Selected text AI action: rewrite",
  },
  retranslate: {
    defaultMessage: "Retranslate",
    id: "X5Hzy98RDK",
    description: "Selected text AI action: retranslate",
  },
  grammar: {
    defaultMessage: "Fix grammar",
    id: "4Pn2dw7D0g",
    description: "Selected text AI action: grammar",
  },
  shorten: {
    defaultMessage: "Shorten",
    id: "0GWUwQf/rA",
    description: "Selected text AI action: shorten",
  },
  formal: {
    defaultMessage: "More formal",
    id: "peLVikUnRO",
    description: "Selected text AI action: formal",
  },
  glossary: {
    defaultMessage: "Use glossary",
    id: "00ieHaQyV0",
    description: "Selected text AI action: glossary",
  },
  languages: {
    defaultMessage: "{source} → {target}",
    id: "rDiY5qJwvA",
    description: "Document selection AI: languages",
  },
  working: {
    defaultMessage: "Reviewing the selected text…",
    id: "ZHAUTLLk92",
    description: "Document selection AI: working",
  },
  apply: {
    defaultMessage: "Replace",
    id: "ZBWN3dK2pg",
    description: "Document selection AI: apply",
  },
  dismiss: {
    defaultMessage: "Dismiss",
    id: "sztfnPs5zo",
    description: "Document selection AI: dismiss",
  },
  retry: {
    defaultMessage: "Try again",
    id: "wjkf38j8BS",
    description: "Retry AI recommendation",
  },
  failed: {
    defaultMessage: "Could not get a suggestion. Try again.",
    id: "dks4P6TTYa",
    description: "Document selection AI: failed",
  },
  stale: {
    defaultMessage: "The document changed. Select the passage again before applying a suggestion.",
    id: "rn73xYsyFw",
    description: "Document selection AI: stale",
  },
  tooLong: {
    defaultMessage: "Select a shorter passage to ask AI.",
    id: "9b9TA2HwBA",
    description: "Document selection AI: tooLong",
  },
});
