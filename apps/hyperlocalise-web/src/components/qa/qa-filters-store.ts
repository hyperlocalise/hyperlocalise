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
export const DEFAULT_QA_STATUS_FILTER = "open";
export const QA_FILTER_ALL = "all";

export type QaFindingFocus = {
  locale?: string;
  checkType?: string;
};

export type QaFindingFilterState = {
  locale: string;
  checkType: string;
  severity: string;
  status: string;
};

export function emptyQaFindingFilters(): QaFindingFilterState {
  return {
    locale: QA_FILTER_ALL,
    checkType: QA_FILTER_ALL,
    severity: QA_FILTER_ALL,
    status: DEFAULT_QA_STATUS_FILTER,
  };
}

export function hasQaFindingFilters(filters: QaFindingFilterState) {
  return (
    filters.locale !== QA_FILTER_ALL ||
    filters.checkType !== QA_FILTER_ALL ||
    filters.severity !== QA_FILTER_ALL ||
    filters.status !== DEFAULT_QA_STATUS_FILTER
  );
}

export function applyQaFindingFocus<T extends QaFindingFilterState & { tab: string }>(
  target: T,
  filter: QaFindingFocus,
) {
  if (filter.locale) target.locale = filter.locale;
  if (filter.checkType) target.checkType = filter.checkType;
  target.tab = "findings";
}
