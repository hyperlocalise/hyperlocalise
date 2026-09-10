"use client";

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
import { defineMessages } from "react-intl";

export const repositorySelectorMessages = defineMessages({
  reposUnavailable: {
    defaultMessage: "Repos unavailable",
    id: "JekhZbjY8c",
    description: "Repository selector label when repositories failed to load",
  },
  noRepos: {
    defaultMessage: "No repos",
    id: "iFmiFrAfXR",
    description: "Repository selector label when the account has no GitHub or GitLab repositories",
  },
  repoPlaceholder: {
    defaultMessage: "Repository",
    id: "3nJQ/U/1eb",
    description: "Repository selector placeholder when no repository is selected yet",
  },
});
