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
import { serializeSpellcheckWordFile } from "./normalize-word";

export const SANDBOX_SPELLCHECK_DICTIONARY_DIR = ".hl-sandbox-dictionaries";

export type SandboxSpellcheckDictionaryFile = {
  path: string;
  content: string;
};

export function sandboxSpellcheckDictionaryDir(workspaceRoot = "."): string {
  return workspaceRoot === "."
    ? SANDBOX_SPELLCHECK_DICTIONARY_DIR
    : `${workspaceRoot.replace(/\/$/, "")}/${SANDBOX_SPELLCHECK_DICTIONARY_DIR}`;
}

export function buildSandboxSpellcheckDictionaryFiles(
  wordsByLocale: Readonly<Record<string, readonly string[]>>,
  workspaceRoot = ".",
): { directory: string; files: SandboxSpellcheckDictionaryFile[] } {
  const directory = sandboxSpellcheckDictionaryDir(workspaceRoot);
  const files = Object.entries(wordsByLocale).flatMap(([locale, words]) => {
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(locale) || words.length === 0) {
      return [];
    }

    return [
      {
        path: `${directory}/${locale}.txt`,
        content: serializeSpellcheckWordFile(words),
      },
    ];
  });

  return { directory, files };
}
