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

import {
  PROJECT_AVATAR_KEY_MAX_LENGTH,
  ProjectAvatar,
  projectAvatarLabelFromName,
} from "./project-avatar";

describe("projectAvatarLabelFromName", () => {
  it("uses word initials for multi-word names", () => {
    expect(projectAvatarLabelFromName("Website Launch")).toBe("WL");
    expect(projectAvatarLabelFromName("Hyper Local App")).toBe("HLA");
  });

  it("uses leading letters for single-word names", () => {
    expect(projectAvatarLabelFromName("Tourmatic")).toBe("TOU");
  });

  it("falls back when the name is empty", () => {
    expect(projectAvatarLabelFromName("")).toBe("PRJ");
    expect(projectAvatarLabelFromName("   ")).toBe("PRJ");
  });
});

describe("ProjectAvatar", () => {
  it("derives the fallback from the project name instead of the identifier", () => {
    render(
      <ProjectAvatar
        project={{
          name: "Tourmatic",
          logoUrl: null,
          externalProviderKind: null,
          source: "native",
        }}
      />,
    );

    expect(screen.getByText("TOU")).toBeInTheDocument();
    expect(screen.queryByText("P1F")).not.toBeInTheDocument();
    expect(screen.getByTitle("Tourmatic")).toBeInTheDocument();
    expect(PROJECT_AVATAR_KEY_MAX_LENGTH).toBe(3);
  });

  it("keeps short name labels unchanged", () => {
    render(
      <ProjectAvatar
        project={{
          name: "Docs",
          logoUrl: null,
          externalProviderKind: null,
          source: "native",
        }}
      />,
    );

    expect(screen.getByText("DOC")).toBeInTheDocument();
  });
});
