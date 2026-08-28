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

export const tmEntryDetailMessages = defineMessages({
  title: {
    defaultMessage: "Translation memory entry",
    id: "7A+LIW8RCQ",
    description: "Title of the translation memory entry detail sheet",
  },
  description: {
    defaultMessage: "Inspect provenance, variants, and change history before editing.",
    id: "zyDpy3oZz4",
    description: "Description of the translation memory entry detail sheet",
  },
  loading: {
    defaultMessage: "Loading entry",
    id: "KO9Xwf/4Fp",
    description: "Loading state for the translation memory entry detail sheet",
  },
  error: {
    defaultMessage: "Unable to load this entry.",
    id: "Jjjtb6X1+r",
    description: "Error state when a translation memory entry detail request fails",
  },
  retry: {
    defaultMessage: "Try again",
    id: "sbLhquVO94",
    description: "Button to retry loading a translation memory entry",
  },
  sourceTextLabel: {
    defaultMessage: "Source",
    id: "BpPaoyY1SX",
    description: "Label for the source text field on a translation memory entry",
  },
  targetTextLabel: {
    defaultMessage: "Target",
    id: "tePjGq4NMG",
    description: "Label for the target text field on a translation memory entry",
  },
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "ct3IfkjjG0",
    description: "Label for the source locale field on a translation memory entry",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "4zerueK9Yh",
    description: "Label for the target locale field on a translation memory entry",
  },
  reviewStatusLabel: {
    defaultMessage: "Review state",
    id: "Ulwytenhu/",
    description: "Label for the review status field on a translation memory entry",
  },
  contextLabel: {
    defaultMessage: "Context",
    id: "mJvrZmGJKT",
    description: "Label for the linguistic context field on a translation memory entry",
  },
  contextEmpty: {
    defaultMessage: "No context recorded",
    id: "7rwI1YGn2f",
    description: "Empty state when a translation memory entry has no context metadata",
  },
  metadataTitle: {
    defaultMessage: "Metadata",
    id: "Y2HSD0YkmQ",
    description: "Heading for structured metadata on a translation memory entry",
  },
  provenanceTitle: {
    defaultMessage: "Provenance",
    id: "ZTq/3uWeH1",
    description: "Heading for provenance on a translation memory entry",
  },
  originLabel: {
    defaultMessage: "Origin",
    id: "Gwb99kw7HD",
    description: "Label for the origin provenance field",
  },
  providerLabel: {
    defaultMessage: "Provider",
    id: "b6mAqVt2e8",
    description: "Label for the provider provenance field",
  },
  importBatchLabel: {
    defaultMessage: "Import batch",
    id: "cXcTyAvqBj",
    description: "Label for the import batch provenance field",
  },
  createdLabel: {
    defaultMessage: "Created",
    id: "ZmNj69gp84",
    description: "Label for the created actor and timestamp",
  },
  modifiedLabel: {
    defaultMessage: "Modified",
    id: "VfTXpLSxVb",
    description: "Label for the modified actor and timestamp",
  },
  reviewedLabel: {
    defaultMessage: "Reviewed",
    id: "G4VyeiT+RV",
    description: "Label for the reviewed actor and timestamp",
  },
  importedLabel: {
    defaultMessage: "Imported",
    id: "zT8F09z/zF",
    description: "Label for the imported actor and timestamp",
  },
  providerSuppliedLabel: {
    defaultMessage: "Provider supplied",
    id: "u0JPXvQtPf",
    description: "Label for provider-supplied actor and timestamp",
  },
  unknownActor: {
    defaultMessage: "Unknown",
    id: "xiCbvJEipB",
    description: "Fallback when a translation memory entry actor name is missing",
  },
  variantsTitle: {
    defaultMessage: "Related variants",
    id: "AF2gG24fEN",
    description: "Heading for related translation memory variants",
  },
  variantsEmpty: {
    defaultMessage: "No related variants.",
    id: "EtLBqA9kAL",
    description: "Empty state when a translation memory entry has no related variants",
  },
  openVariant: {
    defaultMessage: "Open {targetLocale}",
    id: "2xb0GxPbgL",
    description: "Button that opens a related translation memory variant",
  },
  auditTitle: {
    defaultMessage: "Audit timeline",
    id: "hu3lSudbHb",
    description: "Heading for the translation memory entry audit timeline",
  },
  auditEmpty: {
    defaultMessage: "No audit events yet.",
    id: "D2baOujkvw",
    description: "Empty state when a translation memory entry has no audit events",
  },
  eventCreated: {
    defaultMessage: "Created",
    id: "oMuRHnqRWn",
    description: "Audit event label for a created translation memory entry",
  },
  eventUpdated: {
    defaultMessage: "Updated",
    id: "PthTK/fRZG",
    description: "Audit event label for an updated translation memory entry",
  },
  eventReviewed: {
    defaultMessage: "Reviewed",
    id: "IRcbylygLF",
    description: "Audit event label for a reviewed translation memory entry",
  },
  eventImported: {
    defaultMessage: "Imported",
    id: "35plZYGZfi",
    description: "Audit event label for an imported translation memory entry",
  },
  eventSynced: {
    defaultMessage: "Synced from provider",
    id: "uCdYlw2611",
    description: "Audit event label for a provider-synced translation memory entry",
  },
  readOnlyNotice: {
    defaultMessage: "This entry is read-only.",
    id: "rsXJHUa4+k",
    description: "Notice shown when a translation memory entry cannot be edited",
  },
  edit: {
    defaultMessage: "Edit",
    id: "4ePMzhVeCL",
    description: "Button that starts editing a translation memory entry",
  },
  save: {
    defaultMessage: "Save changes",
    id: "KvwPfol3sj",
    description: "Button that saves translation memory entry edits",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "FY2mmq0gaX",
    description: "Button that cancels translation memory entry edits",
  },
  staleConflict: {
    defaultMessage:
      "This entry changed while you were editing. Load the latest version to continue.",
    id: "bpsmIZ07ut",
    description: "Conflict message when a translation memory entry edit is stale",
  },
  loadLatest: {
    defaultMessage: "Load latest",
    id: "gUYTSWGjp1",
    description: "Button that reloads the latest translation memory entry after a conflict",
  },
  saved: {
    defaultMessage: "Entry updated",
    id: "3VvPI125F/",
    description: "Toast after a translation memory entry is updated from the detail sheet",
  },
  saveFailed: {
    defaultMessage: "Unable to save entry",
    id: "geqPhiQmeR",
    description:
      "Fallback error when saving a translation memory entry from the detail sheet fails",
  },
  close: {
    defaultMessage: "Close",
    id: "GA/at1eIok",
    description: "Button that closes the translation memory entry detail sheet",
  },
});
