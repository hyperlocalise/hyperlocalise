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

import type { ChatRepository } from "./chat-repository";
import { chatRepositorySelectionKey } from "./chat-repository";
import { RepositorySelector } from "./repository-selector";

function renderWithIntl(ui: ReactElement) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      {ui}
    </IntlProvider>,
  );
}

function createRepository(overrides: Partial<ChatRepository> = {}): ChatRepository {
  const name = overrides.name ?? "web";
  const fullName = overrides.fullName ?? `acme/${name}`;
  const provider = overrides.provider ?? "github";

  return {
    archived: false,
    defaultBranch: "main",
    enabled: true,
    fullName,
    name,
    provider,
    selectionKey: chatRepositorySelectionKey(provider, fullName),
    ...overrides,
  };
}

describe("RepositorySelector", () => {
  it("opens the repository menu and selects a GitLab project", async () => {
    const user = userEvent.setup();
    const onSelectRepository = vi.fn();
    const gitlabRepository = createRepository({
      provider: "gitlab",
      name: "docs",
      fullName: "acme/platform/docs",
    });

    renderWithIntl(
      <RepositorySelector
        repositories={[
          createRepository({ name: "web", fullName: "acme/web" }),
          gitlabRepository,
        ]}
        repositoriesIsError={false}
        repositoriesIsLoading={false}
        selectedRepositoryKey=""
        onSelectRepository={onSelectRepository}
        triggerStyle="button"
      />,
    );

    await user.click(screen.getByRole("button", { name: /repository/i }));
    await user.click(await screen.findByText("acme/platform/docs"));

    expect(onSelectRepository).toHaveBeenCalledWith(gitlabRepository);
  });
});
