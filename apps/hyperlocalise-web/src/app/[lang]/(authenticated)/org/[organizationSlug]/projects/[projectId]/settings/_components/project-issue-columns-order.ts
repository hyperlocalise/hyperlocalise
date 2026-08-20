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

export function moveColumnIdInGroup(
  orderedIds: string[],
  groupIds: string[],
  columnId: string,
  direction: -1 | 1,
) {
  const groupIndex = groupIds.indexOf(columnId);
  const nextGroupIndex = groupIndex + direction;
  if (groupIndex < 0 || nextGroupIndex < 0 || nextGroupIndex >= groupIds.length) {
    return null;
  }
  const swapWithId = groupIds[nextGroupIndex];
  if (!swapWithId) {
    return null;
  }
  const from = orderedIds.indexOf(columnId);
  const to = orderedIds.indexOf(swapWithId);
  const fromId = orderedIds[from];
  const toId = orderedIds[to];
  if (from < 0 || to < 0 || fromId === undefined || toId === undefined) {
    return null;
  }
  const next = [...orderedIds];
  next[from] = toId;
  next[to] = fromId;
  return next;
}
