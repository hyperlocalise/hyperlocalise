type FontNameLike = {
  family: string;
  style: string;
  variationSettings?: Record<string, number>;
};

export function fontNameCacheKey(font: FontNameLike): string {
  return JSON.stringify({
    family: font.family,
    style: font.style,
    variationSettings: font.variationSettings ?? null,
  });
}

/** Every font instance used in the node must be loaded before `characters` can change. */
export function fontsUsedByTextNode(node: TextNode): FontName[] {
  const length = node.characters.length;
  if (length === 0) {
    if (node.fontName !== figma.mixed) {
      return [node.fontName];
    }
    return [];
  }
  return node.getRangeAllFontNames(0, length);
}

export async function loadFontsForTextNodes(nodes: TextNode[]): Promise<void> {
  const pending = new Map<string, FontName>();
  for (const node of nodes) {
    for (const font of fontsUsedByTextNode(node)) {
      const key = fontNameCacheKey(font);
      if (!pending.has(key)) {
        pending.set(key, font);
      }
    }
  }
  await Promise.all([...pending.values()].map((font) => figma.loadFontAsync(font)));
}
