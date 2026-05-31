export type GitHubPullRequestReference = {
  repositoryFullName: string;
  pullRequestNumber: number;
  sourceUrl: string;
};

export const githubPullRequestUrlPatternSource = String.raw`https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/pull\/(\d+)(?=[/?#\s>|)\].,;:!?]|$)`;

const githubPullRequestUrlPattern = new RegExp(githubPullRequestUrlPatternSource, "gi");
const githubRepositoryUrlPattern =
  /https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9_.-]+)(?=[/?#\s>|)\].,;:!?]|$)/gi;
const githubRepositoryFullNamePattern =
  /(?:^|[\s(<])([A-Za-z0-9-]+\/[A-Za-z0-9_.-]+)(?=[\s>|)\].,;:!?]|$)/gi;

export function extractGitHubPullRequestReferences(text: string): GitHubPullRequestReference[] {
  const references = new Map<string, GitHubPullRequestReference>();

  for (const match of text.matchAll(githubPullRequestUrlPattern)) {
    const owner = match[1];
    const repo = match[2];
    const pullRequestNumber = Number.parseInt(match[3] ?? "", 10);
    if (!owner || !repo || !Number.isSafeInteger(pullRequestNumber)) {
      continue;
    }

    const repositoryFullName = `${owner}/${repo}`;
    references.set(`${repositoryFullName.toLowerCase()}#${pullRequestNumber}`, {
      repositoryFullName,
      pullRequestNumber,
      sourceUrl: match[0],
    });
  }

  return [...references.values()];
}

export function extractGitHubPullRequestNumber(text: string): "ambiguous" | number | null {
  const numbers = new Set<number>();

  for (const pattern of [/\b(?:pr|pull request)\s*#?(\d+)\b/gi, /\bgithub\s+#?(\d+)\b/gi]) {
    for (const match of text.matchAll(pattern)) {
      const pullRequestNumber = Number.parseInt(match[1] ?? "", 10);
      if (Number.isSafeInteger(pullRequestNumber)) {
        numbers.add(pullRequestNumber);
      }
    }
  }

  if (numbers.size > 1) {
    return "ambiguous";
  }

  return numbers.values().next().value ?? null;
}

export function extractGitHubRepositoryFullNameReferences(text: string): string[] {
  const references = new Map<string, string>();

  for (const match of text.matchAll(githubRepositoryUrlPattern)) {
    const owner = match[1];
    const repo = match[2];
    if (!owner || !repo) {
      continue;
    }

    const repositoryFullName = normalizeRepositoryFullName(
      trimTrailingRepositoryReferencePunctuation(`${owner}/${repo}`),
    );
    if (repositoryFullName) {
      references.set(repositoryFullName.toLowerCase(), repositoryFullName);
    }
  }

  for (const match of text.matchAll(githubRepositoryFullNamePattern)) {
    const repositoryFullName = normalizeRepositoryFullName(
      trimTrailingRepositoryReferencePunctuation(match[1] ?? ""),
    );
    if (repositoryFullName) {
      references.set(repositoryFullName.toLowerCase(), repositoryFullName);
    }
  }

  return [...references.values()];
}

function normalizeRepositoryFullName(value: string): string | null {
  const trimmed = value.trim();
  const parts = trimmed.split("/");
  if (parts.length !== 2) {
    return null;
  }

  const [owner, repo] = parts;
  if (!owner || !repo || /\s/.test(owner) || /\s/.test(repo)) {
    return null;
  }

  return `${owner}/${repo}`;
}

function trimTrailingRepositoryReferencePunctuation(value: string) {
  return value.replace(/[.,;:!?]+$/g, "");
}
