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
import { z } from "zod";

import { parseLiveProviderGlossaryId } from "@/lib/providers/jobs/tms-provider-resource-id";

/** Hyperlocalise glossary rows use UUID ids; live provider glossaries use encoded ids. */
export function isQueryableNativeGlossaryId(value: string) {
  return z.uuid().safeParse(value).success && parseLiveProviderGlossaryId(value) === null;
}

/** Glossaries whose concepts and terms are stored in Hyperlocalise (native or mirrored sync). */
export function glossaryUsesPersistedConceptStore(glossary: {
  id: string;
  source: "native" | "external_tms";
}) {
  return (
    glossary.source === "native" ||
    (glossary.source === "external_tms" && isQueryableNativeGlossaryId(glossary.id))
  );
}
