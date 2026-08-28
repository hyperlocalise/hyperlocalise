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
    id: "tmEntryDetailTitle01",
    description: "Title of the translation memory entry detail sheet",
  },
  description: {
    defaultMessage: "Inspect provenance, variants, and change history before editing.",
    id: "tmEntryDetailDesc01",
    description: "Description of the translation memory entry detail sheet",
  },
  loading: {
    defaultMessage: "Loading entry",
    id: "tmEntryDetailLoad01",
    description: "Loading state for the translation memory entry detail sheet",
  },
  error: {
    defaultMessage: "Unable to load this entry.",
    id: "tmEntryDetailErr01",
    description: "Error state when a translation memory entry detail request fails",
  },
  retry: {
    defaultMessage: "Try again",
    id: "tmEntryDetailRetry01",
    description: "Button to retry loading a translation memory entry",
  },
  sourceTextLabel: {
    defaultMessage: "Source",
    id: "tmEntryDetailSrc01",
    description: "Label for the source text field on a translation memory entry",
  },
  targetTextLabel: {
    defaultMessage: "Target",
    id: "tmEntryDetailTgt01",
    description: "Label for the target text field on a translation memory entry",
  },
  sourceLocaleLabel: {
    defaultMessage: "Source locale",
    id: "tmEntryDetailSrcLoc01",
    description: "Label for the source locale field on a translation memory entry",
  },
  targetLocaleLabel: {
    defaultMessage: "Target locale",
    id: "tmEntryDetailTgtLoc01",
    description: "Label for the target locale field on a translation memory entry",
  },
  reviewStatusLabel: {
    defaultMessage: "Review state",
    id: "tmEntryDetailReview01",
    description: "Label for the review status field on a translation memory entry",
  },
  contextLabel: {
    defaultMessage: "Context",
    id: "tmEntryDetailCtx01",
    description: "Label for the linguistic context field on a translation memory entry",
  },
  contextEmpty: {
    defaultMessage: "No context recorded",
    id: "tmEntryDetailCtxEmpty01",
    description: "Empty state when a translation memory entry has no context metadata",
  },
  metadataTitle: {
    defaultMessage: "Metadata",
    id: "tmEntryDetailMeta01",
    description: "Heading for structured metadata on a translation memory entry",
  },
  provenanceTitle: {
    defaultMessage: "Provenance",
    id: "tmEntryDetailProv01",
    description: "Heading for provenance on a translation memory entry",
  },
  originLabel: {
    defaultMessage: "Origin",
    id: "tmEntryDetailOrigin01",
    description: "Label for the origin provenance field",
  },
  providerLabel: {
    defaultMessage: "Provider",
    id: "tmEntryDetailProvLabel01",
    description: "Label for the provider provenance field",
  },
  importBatchLabel: {
    defaultMessage: "Import batch",
    id: "tmEntryDetailBatch01",
    description: "Label for the import batch provenance field",
  },
  createdLabel: {
    defaultMessage: "Created",
    id: "tmEntryDetailCreated01",
    description: "Label for the created actor and timestamp",
  },
  modifiedLabel: {
    defaultMessage: "Modified",
    id: "tmEntryDetailModified01",
    description: "Label for the modified actor and timestamp",
  },
  reviewedLabel: {
    defaultMessage: "Reviewed",
    id: "tmEntryDetailReviewed01",
    description: "Label for the reviewed actor and timestamp",
  },
  importedLabel: {
    defaultMessage: "Imported",
    id: "tmEntryDetailImported01",
    description: "Label for the imported actor and timestamp",
  },
  providerSuppliedLabel: {
    defaultMessage: "Provider supplied",
    id: "tmEntryDetailProvSup01",
    description: "Label for provider-supplied actor and timestamp",
  },
  unknownActor: {
    defaultMessage: "Unknown",
    id: "tmEntryDetailUnknown01",
    description: "Fallback when a translation memory entry actor name is missing",
  },
  variantsTitle: {
    defaultMessage: "Related variants",
    id: "tmEntryDetailVariants01",
    description: "Heading for related translation memory variants",
  },
  variantsEmpty: {
    defaultMessage: "No related variants.",
    id: "tmEntryDetailVarEmpty01",
    description: "Empty state when a translation memory entry has no related variants",
  },
  openVariant: {
    defaultMessage: "Open {targetLocale}",
    id: "tmEntryDetailOpenVar01",
    description: "Button that opens a related translation memory variant",
  },
  auditTitle: {
    defaultMessage: "Audit timeline",
    id: "tmEntryDetailAudit01",
    description: "Heading for the translation memory entry audit timeline",
  },
  auditEmpty: {
    defaultMessage: "No audit events yet.",
    id: "tmEntryDetailAuditEmpty01",
    description: "Empty state when a translation memory entry has no audit events",
  },
  eventCreated: {
    defaultMessage: "Created",
    id: "tmEntryDetailEvtCreated01",
    description: "Audit event label for a created translation memory entry",
  },
  eventUpdated: {
    defaultMessage: "Updated",
    id: "tmEntryDetailEvtUpdated01",
    description: "Audit event label for an updated translation memory entry",
  },
  eventReviewed: {
    defaultMessage: "Reviewed",
    id: "tmEntryDetailEvtReviewed01",
    description: "Audit event label for a reviewed translation memory entry",
  },
  eventImported: {
    defaultMessage: "Imported",
    id: "tmEntryDetailEvtImported01",
    description: "Audit event label for an imported translation memory entry",
  },
  eventSynced: {
    defaultMessage: "Synced from provider",
    id: "tmEntryDetailEvtSynced01",
    description: "Audit event label for a provider-synced translation memory entry",
  },
  readOnlyNotice: {
    defaultMessage: "This entry is read-only.",
    id: "tmEntryDetailReadOnly01",
    description: "Notice shown when a translation memory entry cannot be edited",
  },
  edit: {
    defaultMessage: "Edit",
    id: "tmEntryDetailEdit01",
    description: "Button that starts editing a translation memory entry",
  },
  save: {
    defaultMessage: "Save changes",
    id: "tmEntryDetailSave01",
    description: "Button that saves translation memory entry edits",
  },
  cancel: {
    defaultMessage: "Cancel",
    id: "tmEntryDetailCancel01",
    description: "Button that cancels translation memory entry edits",
  },
  staleConflict: {
    defaultMessage: "This entry changed while you were editing. Load the latest version to continue.",
    id: "tmEntryDetailStale01",
    description: "Conflict message when a translation memory entry edit is stale",
  },
  loadLatest: {
    defaultMessage: "Load latest",
    id: "tmEntryDetailLoadLatest01",
    description: "Button that reloads the latest translation memory entry after a conflict",
  },
  saved: {
    defaultMessage: "Entry updated",
    id: "tmEntryDetailSaved01",
    description: "Toast after a translation memory entry is updated from the detail sheet",
  },
  saveFailed: {
    defaultMessage: "Unable to save entry",
    id: "tmEntryDetailSaveFail01",
    description: "Fallback error when saving a translation memory entry from the detail sheet fails",
  },
  close: {
    defaultMessage: "Close",
    id: "tmEntryDetailClose01",
    description: "Button that closes the translation memory entry detail sheet",
  },
});
