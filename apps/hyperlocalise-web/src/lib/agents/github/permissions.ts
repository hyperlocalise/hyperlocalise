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
import { getInstallationOctokit } from "@/lib/agents/github/app";

const githubCommandWritePermissions = new Set(["admin", "maintain", "write"]);

export async function requesterCanRunGitHubCommand(input: {
  installationId: number;
  repositoryOwner: string;
  repositoryName: string;
  requesterLogin: string;
}) {
  let data: { permission?: string };
  try {
    const octokit = await getInstallationOctokit(input.installationId);
    ({ data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner: input.repositoryOwner,
      repo: input.repositoryName,
      username: input.requesterLogin,
    }));
  } catch (error) {
    if (isPermissionLookupDenial(error)) {
      return false;
    }
    throw error;
  }

  return data.permission ? githubCommandWritePermissions.has(data.permission) : false;
}

function isPermissionLookupDenial(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return false;
  }
  const status = error.status;
  if (status === 404) {
    return true;
  }
  if (status !== 403) {
    return false;
  }
  const message = "message" in error && typeof error.message === "string" ? error.message : "";
  const response =
    "response" in error && typeof error.response === "object" && error.response !== null
      ? error.response
      : null;
  const headers =
    response && "headers" in response && typeof response.headers === "object"
      ? response.headers
      : null;
  const rateLimitRemaining =
    headers && "x-ratelimit-remaining" in headers ? headers["x-ratelimit-remaining"] : null;

  return rateLimitRemaining !== "0" && !/rate limit/i.test(message);
}
