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

import { Settings01Icon } from "@hugeicons/core-free-icons";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { ProjectSettingsSectionHeading } from "./project-settings-section-heading";

describe("ProjectSettingsSectionHeading", () => {
  it("renders a colored icon chip next to the section title", () => {
    render(
      <ProjectSettingsSectionHeading
        icon={Settings01Icon}
        tone="dew"
        title="General"
        description="Name the project"
      />,
    );

    expect(screen.getByRole("heading", { name: "General" })).toBeInTheDocument();
    expect(screen.getByText("Name the project")).toBeInTheDocument();
    expect(document.querySelector("[data-slot=project-settings-section-icon]")).toHaveAttribute(
      "data-tone",
      "dew",
    );
  });
});
