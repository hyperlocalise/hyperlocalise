import type { FigmaPageOption } from "./plugin-messages";

/** Keep in sync with `figmaLocalesQuerySchema` `pageIds` max in hyperlocalise-web. */
export const FIGMA_LOCALE_STATUS_PAGE_LIMIT = 50;

export function allPageIds(pageList: FigmaPageOption[]) {
  return pageList.map((page) => page.pageId);
}

export function normalizeSelectedPageIds(selected: string[], pageList: FigmaPageOption[]) {
  const valid = new Set(allPageIds(pageList));
  return selected.filter((id) => valid.has(id));
}

export function resolveSelectedPageIds(saved: string[], pageList: FigmaPageOption[]) {
  const normalized = normalizeSelectedPageIds(saved, pageList);
  const selected = normalized.length > 0 ? normalized : allPageIds(pageList);
  return selected.slice(0, FIGMA_LOCALE_STATUS_PAGE_LIMIT);
}
