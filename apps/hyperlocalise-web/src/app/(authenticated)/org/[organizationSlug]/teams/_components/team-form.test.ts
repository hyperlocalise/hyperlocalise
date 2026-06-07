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
