/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
type BlogDateIntl = {
  formatDate: (value: Date | number, options?: Intl.DateTimeFormatOptions) => string;
};

export function formatBlogPostDate(intl: BlogDateIntl, date: string) {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return date;
  }

  return intl.formatDate(parsed, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
