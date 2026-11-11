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
  applyLoopsSegmentTranslations,
  extractLoopsTextSegments,
  parseLoopsEmailEnvelope,
  serializeLoopsEmailEnvelope,
} from "./html-envelope";
import { protectLoopsVariables, restoreLoopsVariables } from "./variables";

export type LoopsRemoteCopyFields = {
  subject?: string | null;
  previewText?: string | null;
  lmx?: string | null;
};

export type AppliedLoopsHtmlTranslations = {
  subject: string;
  previewText?: string;
  lmx: string;
  segments: string[];
};

function restoreProtectedLoopsField(value: string, sourceForTokens: string): string {
  const tokens = protectLoopsVariables(sourceForTokens).tokens;
  if (tokens.length === 0) {
    return value;
  }
  return restoreLoopsVariables(value, tokens);
}

/**
 * Apply approved HTML ingest keys onto the remote locale copy when its LMX
 * still matches the imported segment count. Unapproved nodes then keep the
 * existing Loops copy instead of falling back to source language and
 * overwriting it.
 *
 * New copies (`preferRemote: false`) and empty remotes use the stored source
 * envelope. An existing copy whose segment count diverged is skipped so push
 * does not clobber remote text.
 */
export function applyApprovedLoopsHtmlTranslations(input: {
  storedEnvelopeHtml: string;
  storedLmx: string;
  remote: LoopsRemoteCopyFields;
  approved: Record<string, string>;
  preferRemote: boolean;
}): AppliedLoopsHtmlTranslations | { diverged: true } {
  const stored = parseLoopsEmailEnvelope(input.storedEnvelopeHtml);
  const storedSegments = extractLoopsTextSegments(input.storedLmx);
  const remoteLmx = input.remote.lmx?.trim() ?? "";
  const remoteSegments = remoteLmx ? extractLoopsTextSegments(remoteLmx) : [];
  const remoteMatchesStored =
    remoteSegments.length > 0 && remoteSegments.length === storedSegments.length;
  const useRemote = input.preferRemote && remoteMatchesStored;
  if (input.preferRemote && remoteSegments.length > 0 && !remoteMatchesStored) {
    return { diverged: true };
  }

  const envelopeSubject = useRemote ? (input.remote.subject ?? stored.subject) : stored.subject;
  const envelopePreview = useRemote
    ? (input.remote.previewText ?? stored.previewText)
    : stored.previewText;
  const envelopeLmx = useRemote ? remoteLmx : input.storedLmx;
  const serialized = serializeLoopsEmailEnvelope({
    subject: envelopeSubject,
    previewText: envelopePreview,
    lmx: envelopeLmx,
  });
  const parsed = parseLoopsEmailEnvelope(
    applyHtmlIngestTranslations(serialized.html, input.approved),
  );
  return {
    subject: restoreProtectedLoopsField(parsed.subject, envelopeSubject),
    previewText: parsed.previewText
      ? restoreProtectedLoopsField(parsed.previewText, envelopePreview ?? "")
      : undefined,
    lmx: applyLoopsSegmentTranslations({
      lmx: envelopeLmx,
      translatedSegments: parsed.segments,
      tokensBySegment: serialized.tokensBySegment,
    }),
    segments: parsed.segments,
  };
}
