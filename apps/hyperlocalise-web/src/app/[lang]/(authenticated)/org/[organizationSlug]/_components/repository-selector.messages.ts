"use client";

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
