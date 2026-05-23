export function isCrowdinResourceLinkedToProject(input: {
  projectId: number;
  projectIds?: number[];
  defaultProjectIds?: number[];
}): boolean {
  const linkedProjectIds = [...(input.projectIds ?? []), ...(input.defaultProjectIds ?? [])];
  if (linkedProjectIds.length === 0) {
    // Crowdin returns empty projectIds when a TM/glossary is not assigned to any project.
    return false;
  }

  return linkedProjectIds.includes(input.projectId);
}
