export type HlCheckFinding = {
  type: string;
  severity: string;
  locale?: string;
  sourceFile: string;
  targetFile?: string;
  key?: string;
  message?: string;
};

export type HlCheckReport = {
  checks: string[];
  findings: HlCheckFinding[];
  summary: {
    total: number;
    byCheck?: Record<string, number>;
    bySeverity?: Record<string, number>;
  };
};
