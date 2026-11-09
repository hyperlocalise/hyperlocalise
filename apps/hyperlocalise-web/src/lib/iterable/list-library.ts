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

import { isErr, ok, type Result } from "@/lib/primitives/result/results";

import { loadIterableAutomationClient } from "./credentials";
import { isIterableLocaleSuffixSnippetName } from "./source-path";
import type { IterableSettingsError } from "./types";

export type IterableLibraryPickerItem = { id: string; name: string };

export async function listIterableLibraryForPicker(input: {
  localOrganizationId: string;
  workosUserId: string;
}): Promise<
  Result<
    {
      templates: IterableLibraryPickerItem[];
      snippets: IterableLibraryPickerItem[];
    },
    IterableSettingsError
  >
> {
  const loaded = await loadIterableAutomationClient({
    localOrganizationId: input.localOrganizationId,
    workosUserId: input.workosUserId,
  });
  if (isErr(loaded)) {
    return loaded;
  }

  const client = loaded.value.client;
  const [email, inApp, push, sms, snippets] = await Promise.all([
    client.listAllTemplates("Email"),
    client.listAllTemplates("InApp"),
    client.listAllTemplates("Push"),
    client.listAllTemplates("SMS"),
    client.listSnippets(),
  ]);

  const templates = [...email, ...inApp, ...push, ...sms].map((item) => ({
    id: String(item.templateId),
    name: item.name,
  }));

  const suffixes: string[] = [];
  const filteredSnippets = snippets
    .filter((snippet) => !isIterableLocaleSuffixSnippetName(snippet.name, suffixes))
    .map((snippet) => ({
      id: snippet.name,
      name: snippet.name,
    }));

  return ok({ templates, snippets: filteredSnippets });
}
