export type GithubRepositoryAutomationPushSourceSummary = {
  totalCommits: number;
  counts: {
    uploaded: number;
    skipped: number;
    failed: number;
    unchanged: number;
  };
};
