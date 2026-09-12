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

export function actorDisplayName(
  actorKind: string,
  actorUserId: string | null,
  firstName: string | null,
  lastName: string | null,
  email: string | null = null,
) {
  const name = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  // ON DELETE SET NULL clears actorUserId when the user row is removed.
  if (actorKind === "user" && !actorUserId) return "Deleted user";
  if (email) return email;
  return actorKind;
}
