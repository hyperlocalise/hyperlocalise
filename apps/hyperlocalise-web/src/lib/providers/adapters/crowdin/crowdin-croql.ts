export function escapeCrowdinCroqlString(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export function buildCrowdinFileSearchCroql(fileId: number, search: string) {
  const escaped = escapeCrowdinCroqlString(search.trim());
  return `fileId = ${fileId} and (identifier contains "${escaped}" or text contains "${escaped}")`;
}
