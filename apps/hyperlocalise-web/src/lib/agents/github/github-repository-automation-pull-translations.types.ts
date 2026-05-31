export type GithubRepositoryAutomationPullTranslationsSummary = {
  baseSha: string;
  baseBranch: string;
  branchName: string;
  pullRequestUrl?: string;
  pullRequestNumber?: number;
  counts: {
    planned: number;
    written: number;
    skipped: number;
    failed: number;
  };
  linkedTranslationJobIds: string[];
};
