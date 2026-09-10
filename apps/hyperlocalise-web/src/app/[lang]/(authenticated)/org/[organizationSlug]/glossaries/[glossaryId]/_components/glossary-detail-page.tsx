"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 */
import { useGlossary } from "./use-glossary";
import { NativeGlossaryDetail } from "./native-glossary-detail";
import { ProviderGlossaryDetail } from "./provider-glossary-detail";

export function GlossaryDetailPage({
  organizationSlug,
  glossaryId,
  canManageGlossaries,
}: {
  organizationSlug: string;
  glossaryId: string;
  canManageGlossaries: boolean;
}) {
  const { isNative } = useGlossary({
    organizationSlug,
    glossaryId,
    canManageGlossaries,
  });

  return isNative ? (
    <NativeGlossaryDetail
      organizationSlug={organizationSlug}
      glossaryId={glossaryId}
      canManageGlossaries={canManageGlossaries}
    />
  ) : (
    <ProviderGlossaryDetail
      organizationSlug={organizationSlug}
      glossaryId={glossaryId}
      canManageGlossaries={canManageGlossaries}
    />
  );
}
