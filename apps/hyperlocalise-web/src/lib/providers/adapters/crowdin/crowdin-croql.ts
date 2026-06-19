import type { ProjectFileCatQueueFilter } from "@/api/routes/project/project.schema";

export function escapeCrowdinCroqlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildCrowdinFileQueueCroql(input: {
  fileId: number;
  targetLocale: string;
  queueFilter?: ProjectFileCatQueueFilter;
  search?: string;
}) {
  const parts: string[] = [`id of file = ${input.fileId}`];

  if (input.search?.trim()) {
    const escaped = escapeCrowdinCroqlString(input.search.trim());
    parts.push(`(identifier contains "${escaped}" or text contains "${escaped}")`);
  }

  const locale = escapeCrowdinCroqlString(input.targetLocale);
  const languageSummary = `language = @language:"${locale}"`;

  switch (input.queueFilter) {
    case "untranslated":
      parts.push(`count of languages summary where (${languageSummary} and is translated) = 0`);
      break;
    case "needs_review":
      parts.push(
        `count of languages summary where (${languageSummary} and is translated and not is approved) > 0`,
      );
      parts.push("count of comments where (has unresolved issue) = 0");
      break;
    case "reviewed":
      parts.push(`count of languages summary where (${languageSummary} and is approved) > 0`);
      break;
    case "has_issues":
      parts.push("count of comments where (has unresolved issue) > 0");
      break;
    case "all":
    default:
      break;
  }

  return parts.join(" and ");
}

export function buildCrowdinFileSearchCroql(fileId: number, search: string) {
  const escaped = escapeCrowdinCroqlString(search.trim());
  return `id of file = ${fileId} and (identifier contains "${escaped}" or text contains "${escaped}")`;
}
