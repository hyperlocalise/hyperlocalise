// @vitest-environment happy-dom

import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";

import type { GithubRepository } from "./github-repository";
import { RepositorySelector } from "./repository-selector";

function createRepository(overrides: Partial<GithubRepository> = {}): GithubRepository {
  const name = overrides.name ?? "web";
  const owner = overrides.owner ?? "acme";

  return {
    archived: false,
    defaultBranch: "main",
    enabled: true,
    fullName: `${owner}/${name}`,
    githubRepositoryId: `repo_${owner}_${name}`,
    id: `installation_repo_${owner}_${name}`,
    name,
    owner,
    ...overrides,
  };
}

describe("RepositorySelector", () => {
  it("opens the repository menu and selects a repository", async () => {
    const user = userEvent.setup();
    const onSelectRepository = vi.fn();

    render(
      <RepositorySelector
        repositories={[
          createRepository({ name: "web", fullName: "acme/web" }),
          createRepository({ name: "docs", fullName: "acme/docs" }),
        ]}
        repositoriesIsError={false}
        repositoriesIsLoading={false}
        selectedRepositoryFullName=""
        onSelectRepository={onSelectRepository}
        triggerStyle="button"
      />,
    );

    await user.click(screen.getByRole("button", { name: /github repo/i }));
    await user.click(await screen.findByText("acme/docs"));

    expect(onSelectRepository).toHaveBeenCalledWith("acme/docs");
  });
});
