import type { Tone } from "../../_components/workspace-resource-shared";

export type ApiProject = {
  id: string;
  name: string;
  description: string;
  translationContext: string;
  createdAt: string;
  updatedAt: string;
};

export type ProjectPortfolioRow = {
  id: string;
  name: string;
  key: string;
  status: string;
  locales: string;
  jobs: string;
  progress: number;
  source: string;
  next: string;
  updated: string;
  tone: Tone;
};

function formatUpdatedAt(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Updated recently";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function createProjectKey(project: ApiProject) {
  const nameKey = project.name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 4);

  return (
    nameKey ||
    project.id
      .replace(/^project_/, "")
      .slice(0, 4)
      .toUpperCase() ||
    "PROJ"
  );
}

export function mapProjectToPortfolioRow(project: ApiProject): ProjectPortfolioRow {
  return {
    id: project.id,
    name: project.name,
    key: createProjectKey(project),
    status: "Ready",
    locales: "—",
    jobs: "—",
    progress: 0,
    source: project.description || "Project API",
    next: project.translationContext || "Create translation jobs",
    updated: formatUpdatedAt(project.updatedAt),
    tone: "info",
  };
}
