"use client";

import { defineMessages } from "react-intl";

export const repositorySelectorMessages = defineMessages({
  reposUnavailable: {
    defaultMessage: "Repos unavailable",
    id: "Ped2s5KX7Z",
    description: "Repository selector label when GitHub repositories failed to load",
  },
  noGithubRepos: {
    defaultMessage: "No GitHub repos",
    id: "fuMDhQC4xa",
    description: "Repository selector label when the account has no GitHub repositories",
  },
  githubRepoPlaceholder: {
    defaultMessage: "GitHub repo",
    id: "g1Tiy1/MKw",
    description: "Repository selector placeholder when no repository is selected yet",
  },
});
