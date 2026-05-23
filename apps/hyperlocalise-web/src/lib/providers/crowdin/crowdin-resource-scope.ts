export function isCrowdinResourceLinkedToProject(input: {
  projectId: number;
  projectIds?: number[];
  defaultProjectIds?: number[];
}): boolean {
  const linkedProjectIds = [...(input.projectIds ?? []), ...(input.defaultProjectIds ?? [])];
  if (linkedProjectIds.length === 0) {
    return true;
  }

  return linkedProjectIds.includes(input.projectId);
}
