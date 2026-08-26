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
// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { PROJECT_AVATAR_KEY_MAX_LENGTH, ProjectAvatar } from "./project-avatar";

describe("ProjectAvatar", () => {
  it("truncates long project keys to three characters in the fallback", () => {
    render(
      <ProjectAvatar
        project={{
          name: "Tourmatic",
          key: "P1FF26E5FA",
          logoUrl: null,
          externalProviderKind: null,
          source: "native",
        }}
      />,
    );

    expect(screen.getByText("P1F")).toBeInTheDocument();
    expect(screen.queryByText("P1FF26E5FA")).not.toBeInTheDocument();
    expect(screen.getByTitle("P1FF26E5FA")).toBeInTheDocument();
    expect(PROJECT_AVATAR_KEY_MAX_LENGTH).toBe(3);
  });

  it("keeps short keys unchanged", () => {
    render(
      <ProjectAvatar
        project={{
          name: "Docs",
          key: "HL",
          logoUrl: null,
          externalProviderKind: null,
          source: "native",
        }}
      />,
    );

    expect(screen.getByText("HL")).toBeInTheDocument();
  });
});
