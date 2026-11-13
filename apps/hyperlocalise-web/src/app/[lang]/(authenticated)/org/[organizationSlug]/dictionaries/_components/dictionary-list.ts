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
export type ApiDictionary = {
  id: string;
  name: string;
  description: string;
  status: "draft" | "active" | "archived";
  wordsVersion: number;
  wordCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DictionaryListRow = ApiDictionary;

export function filterDictionaryListRows(
  dictionaries: readonly DictionaryListRow[],
  searchQuery: string,
): DictionaryListRow[] {
  const query = searchQuery.trim().toLocaleLowerCase("en");
  if (!query) {
    return [...dictionaries];
  }

  return dictionaries.filter((dictionary) => {
    return (
      dictionary.name.toLocaleLowerCase("en").includes(query) ||
      dictionary.description.toLocaleLowerCase("en").includes(query)
    );
  });
}
