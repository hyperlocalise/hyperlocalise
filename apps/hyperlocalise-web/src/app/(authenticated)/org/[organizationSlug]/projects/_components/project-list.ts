export type ApiProject = {
  id: string;
  name: string;
  description?: string | null;
  translationContext?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

export type ProjectListRow = {
  id: string;
  name: string;
  key: string;
  description: string;
  descriptionValue: string;
  translationContext: string;
  translationContextValue: string;
  created: string;
  updated: string;
};

function formatTimestamp(value: string | Date | null | undefined, fallback: string) {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return fallback;
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

export function mapProjectToListRow(project: ApiProject): ProjectListRow {
  const descriptionValue = project.description?.trim() ?? "";
  const translationContextValue = project.translationContext?.trim() ?? "";

  return {
    id: project.id,
    name: project.name,
    key: createProjectKey(project),
    description: descriptionValue || "No description",
    descriptionValue,
    translationContext: translationContextValue || "No translation context",
    translationContextValue,
    created: formatTimestamp(project.createdAt, "Created date unavailable"),
    updated: formatTimestamp(project.updatedAt, "Updated date unavailable"),
  };
}
