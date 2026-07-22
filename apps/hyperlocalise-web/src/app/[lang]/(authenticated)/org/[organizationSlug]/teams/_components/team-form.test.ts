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
import { describe, expect, it } from "vite-plus/test";

import {
  createEmptyTeamForm,
  suggestTeamSlug,
  teamFormHasErrors,
  toCreateTeamPayload,
  validateTeamForm,
} from "./team-form";

describe("team-form", () => {
  it("requires a team name", () => {
    const errors = validateTeamForm(createEmptyTeamForm(), "create");
    expect(errors.name).toBeTruthy();
    expect(teamFormHasErrors(errors)).toBe(true);
  });

  it("suggests a slug from the team name", () => {
    expect(suggestTeamSlug("Platform Team")).toBe("platform-team");
  });

  it("omits empty slug from create payloads", () => {
    expect(toCreateTeamPayload({ name: "Platform", slug: "" })).toEqual({
      name: "Platform",
    });
  });
});
