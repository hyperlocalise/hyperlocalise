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
"use client";

import { defineMessages } from "react-intl";

export const manageRatesSheetMessages = defineMessages({
  manageTitle: {
    id: "RMcRBqmFdi",
    defaultMessage: "Manage rates",
    description: "Title of the rates panel for admins",
  },
  manageSubtitle: {
    id: "xzZ3ZLUqLC",
    defaultMessage:
      "Rate cards are shared by every report. Changes apply to work recorded from now on.",
    description: "Subtitle of the rates panel for admins",
  },
  viewTitle: {
    id: "Tji75UVkKX",
    defaultMessage: "Rates",
    description: "Title of the rates panel for people who can only read it",
  },
  viewSubtitle: {
    id: "3pASh86JKq",
    defaultMessage: "Only admins can change rates.",
    description: "Subtitle of the read-only rates panel",
  },
  rateCard: {
    id: "R6n2logETh",
    defaultMessage: "Rate card",
    description: "Label of the rate card select",
  },
  newCard: {
    id: "5lYRzKwAYq",
    defaultMessage: "New rate card",
    description: "Button that starts a new rate card",
  },
  cardName: {
    id: "ODK5t+x2fY",
    defaultMessage: "Name",
    description: "Label of the rate card name",
  },
  defaultBasis: {
    id: "o41qBuxIPN",
    defaultMessage: "New lines are charged",
    description: "Label of the rate card's default unit for new lines",
  },
  paidAt: {
    id: "v/o0+J+WoG",
    defaultMessage: "Paid at, by match band",
    description: "Heading of the percentages paid for each match band",
  },
  percentLabel: {
    id: "Sr9zfmzFie",
    defaultMessage: "Paid at for {band}",
    description: "Accessible name of a band's percentage field",
  },
  differingPercentages: {
    id: "mYcgnANb5b",
    defaultMessage:
      "This card's lines pay different shares by match band. Saving applies the shares shown here to every line.",
    description: "Warning when a rate card's lines differ in match band shares",
  },
  differingPercentagesReadOnly: {
    id: "u8ZgyX1le6",
    defaultMessage:
      "This card's lines pay different shares by match band; the first line's shares are shown.",
    description:
      "Note in the read-only rates panel when a card's lines differ in match band shares",
  },
  rates: {
    id: "fUITrRb116",
    defaultMessage: "Rates",
    description: "Heading of the rate lines",
  },
  sourceColumn: {
    id: "TfL+XNaoNd",
    defaultMessage: "From",
    description: "Column heading: source language",
  },
  targetColumn: {
    id: "S3hIFEOuBV",
    defaultMessage: "To",
    description: "Column heading: target language",
  },
  stepColumn: {
    id: "G483RkGMWe",
    defaultMessage: "Step",
    description: "Column heading: the step",
  },
  basisColumn: {
    id: "DH/XelozZt",
    defaultMessage: "Charged",
    description: "Column heading: what the rate is charged per",
  },
  rateColumn: {
    id: "IZpDsIW2Wt",
    defaultMessage: "Rate (USD)",
    description: "Column heading: the rate",
  },
  basis_word: {
    id: "87egh8eq2K",
    defaultMessage: "Per word",
    description: "Rate basis: per word",
  },
  basis_character: {
    id: "KBxDq+vu/v",
    defaultMessage: "Per character",
    description: "Rate basis: per character without spaces",
  },
  basis_character_with_spaces: {
    id: "0JturqYkyf",
    defaultMessage: "Per character with spaces",
    description: "Rate basis: per character including spaces",
  },
  basis_hour: {
    id: "0awmTuRZAE",
    defaultMessage: "Per hour",
    description: "Rate basis: per hour",
  },
  addLine: {
    id: "PFGlpcv7Q5",
    defaultMessage: "Add a rate",
    description: "Button that adds a rate line",
  },
  removeLine: {
    id: "2Juz+958AL",
    defaultMessage: "Remove the {source} to {target} {step} rate",
    description: "Accessible name of the button that removes a rate line",
  },
  noLines: {
    id: "eBImhza46a",
    defaultMessage: "This card has no rates yet.",
    description: "Shown when a rate card has no lines",
  },
  noCards: {
    id: "/95cmg/mS6",
    defaultMessage: "There are no rate cards yet.",
    description: "Shown when the workspace has no rate cards",
  },
  save: {
    id: "5e2kwLA1/H",
    defaultMessage: "Save changes",
    description: "Button that saves the rate card",
  },
  saveAsNew: {
    id: "eeEgKfExfG",
    defaultMessage: "Save as new rate card",
    description: "Button that saves the lines as a new rate card",
  },
  saving: {
    id: "labVcE5WnM",
    defaultMessage: "Saving…",
    description: "Button text while saving",
  },
  saved: {
    id: "+1Os87roDD",
    defaultMessage: "Rate card saved.",
    description: "Message shown after a rate card is saved",
  },
  nameRequired: {
    id: "b27U5B72Hl",
    defaultMessage: "Give the rate card a name.",
    description: "Error when a new card has no name",
  },
  nameTaken: {
    id: "AyOOZuZfFU",
    defaultMessage: "A rate card with this name exists.",
    description: "Error when a new card's name is taken",
  },
  duplicateLine: {
    id: "y1omtoku7R",
    defaultMessage: "Each language pair and step can have one rate on a card.",
    description: "Error when two lines have the same languages and step",
  },
  rateInvalid: {
    id: "R93/hG2PQc",
    defaultMessage: "Enter each rate in US dollars, such as 0.12.",
    description: "Error when a rate is not a valid amount",
  },
  cancel: {
    id: "HmM5vdsqD+",
    defaultMessage: "Close",
    description: "Button that closes the rates panel",
  },
});
