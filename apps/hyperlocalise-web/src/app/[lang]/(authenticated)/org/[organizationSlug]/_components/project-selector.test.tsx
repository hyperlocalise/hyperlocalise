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

import type { ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import type { ChatProjectOption } from "./project-selector-model";
import { ProjectSelector } from "./project-selector";

function renderWithIntl(ui: ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>,
  );
}

function createProject(overrides: Partial<ChatProjectOption> = {}): ChatProjectOption {
  return {
    id: "proj_web",
    name: "Website",
    source: "native",
    externalProviderKind: null,
    ...overrides,
  };
}

describe("ProjectSelector", () => {
  it("opens the project menu and selects a project", async () => {
    const user = userEvent.setup();
    const onSelectProject = vi.fn();

    renderWithIntl(
      <ProjectSelector
        projects={[
          createProject({ id: "proj_web", name: "Website" }),
          createProject({
            id: "ext:crowdin:42",
            name: "Crowdin App",
            source: "external_tms",
            externalProviderKind: "crowdin",
          }),
        ]}
        projectsIsError={false}
        projectsIsLoading={false}
        selectedProjectId=""
        onSelectProject={onSelectProject}
        triggerStyle="button"
      />,
    );

    await user.click(screen.getByRole("button", { name: /project/i }));
    await user.click(await screen.findByText("Crowdin App"));

    expect(onSelectProject).toHaveBeenCalledWith("ext:crowdin:42");
  });

  it("locks the selected project chip when the conversation is already scoped", () => {
    renderWithIntl(
      <ProjectSelector
        projects={[
          createProject({ id: "proj_web", name: "Website" }),
          createProject({ id: "proj_mobile", name: "Mobile" }),
        ]}
        projectsIsError={false}
        projectsIsLoading={false}
        selectedProjectId="proj_web"
        locked
        onSelectProject={vi.fn()}
        triggerStyle="button"
      />,
    );

    expect(screen.getByRole("button", { name: /website/i })).toBeDisabled();
    expect(screen.queryByText("Mobile")).toBeNull();
  });
});
