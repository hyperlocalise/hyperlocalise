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

export type IssueSheetSelectOption = {
  id: string;
  label: string;
  color?: string;
};

export function parseOptionLabelsCsv(raw: string) {
  return raw
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean);
}

export function optionsToCsv(options: IssueSheetSelectOption[]) {
  return options.map((option) => option.label).join(", ");
}

export function selectOptionsFromLabels(labels: string[]): IssueSheetSelectOption[] {
  return labels.map((label) => ({ id: label, label }));
}

export function mergeSelectOptionsFromLabels(
  existing: IssueSheetSelectOption[],
  labels: string[],
): IssueSheetSelectOption[] {
  const unused = [...existing];
  const matched = labels.map((label) => {
    const index = unused.findIndex((option) => option.label === label);
    if (index < 0) {
      return label;
    }
    const [option] = unused.splice(index, 1);
    return option;
  });

  return matched.map((entry) => {
    if (typeof entry !== "string") {
      return entry;
    }
    const leftover = unused.shift();
    if (leftover) {
      return { ...leftover, label: entry };
    }
    return { id: entry, label: entry };
  });
}
