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
import { applyHtmlIngestTranslations } from "@/lib/projects/files/html-ingest-entries";

import {
  buildEmailDocument,
  buildEmailHtmlDocument,
  emailHtmlKinds,
  extractEmailStyleSettings,
  flattenHubspotDocument,
  readEmailHtmlDocument,
  unflattenHubspotDocument,
  type HubspotJson,
  type HubspotStringTree,
} from "./document";

/**
 * Overlay approved keys onto the remote locale document. Unapproved keys keep
 * remote copy, then source. Applying onto the stored source envelope would
 * write source-language text over an existing HubSpot locale copy.
 */
export function applyApprovedHubspotTranslations(input: {
  source: HubspotStringTree;
  remote?: HubspotStringTree | null;
  approved: Record<string, string>;
}): HubspotStringTree {
  const sourceFlat = flattenHubspotDocument(input.source);
  const remoteFlat = input.remote ? flattenHubspotDocument(input.remote) : {};
  const merged: Record<string, string> = {};
  for (const [key, sourceValue] of Object.entries(sourceFlat)) {
    const approvedValue = input.approved[key];
    if (typeof approvedValue === "string") {
      merged[key] = approvedValue;
      continue;
    }
    const remoteValue = remoteFlat[key];
    merged[key] = typeof remoteValue === "string" ? remoteValue : sourceValue;
  }
  return unflattenHubspotDocument(merged);
}

/**
 * Rebuild the stored HTML envelope with remote field values, then apply
 * approved ingest keys. Section order and kinds stay those of the stored
 * source so html.* keys still match.
 */
export function applyApprovedHubspotHtmlTranslations(input: {
  storedEnvelopeHtml: string;
  remoteEnvelopeHtml?: string | null;
  approved: Record<string, string>;
}): string {
  const remote = input.remoteEnvelopeHtml?.trim();
  if (!remote) {
    return applyHtmlIngestTranslations(input.storedEnvelopeHtml, input.approved);
  }
  const sourceTree = readEmailHtmlDocument(input.storedEnvelopeHtml);
  const remoteTree = readEmailHtmlDocument(remote);
  const envelope = applyApprovedHubspotTranslations({
    source: sourceTree,
    remote: remoteTree,
    approved: {},
  });
  const rebuilt = buildEmailHtmlDocument(envelope, {
    kinds: emailHtmlKinds(sourceTree),
    styleSettings:
      extractEmailStyleSettings(remote) ?? extractEmailStyleSettings(input.storedEnvelopeHtml),
  });
  return applyHtmlIngestTranslations(rebuilt, input.approved);
}

export function buildHubspotEmailRemoteEnvelopeHtml(input: {
  storedEnvelopeHtml: string;
  remote: {
    subject: string;
    widgets: HubspotJson;
    styleSettings?: HubspotJson;
  };
}): string {
  const sourceTree = readEmailHtmlDocument(input.storedEnvelopeHtml);
  const overlay = applyApprovedHubspotTranslations({
    source: sourceTree,
    remote: buildEmailDocument({
      subject: input.remote.subject,
      widgets: input.remote.widgets,
    }),
    approved: {},
  });
  return buildEmailHtmlDocument(overlay, {
    kinds: emailHtmlKinds(sourceTree),
    styleSettings:
      input.remote.styleSettings ?? extractEmailStyleSettings(input.storedEnvelopeHtml),
  });
}
