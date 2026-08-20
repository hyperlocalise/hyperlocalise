import { convertWordsToLorem } from "./lorem_generator";

type TranslateMode = "with-formatting" | "without-formatting";

type PluginMessage = { type: "translate"; mode: TranslateMode } | { type: "cancel" };

figma.showUI(__html__, { themeColors: true, width: 320, height: 360 });

figma.ui.onmessage = async (msg: PluginMessage) => {
  if (msg.type === "cancel") {
    figma.closePlugin();
    return;
  }

  if (msg.type !== "translate") {
    return;
  }

  const textNodes = figma.currentPage.findAll((node) => node.type === "TEXT") as TextNode[];

  if (msg.mode === "without-formatting") {
    await translateWithoutFormatting(textNodes);
  } else {
    await translateWithFormatting(textNodes);
  }

  figma.ui.postMessage({ type: "done" });
};

async function translateWithoutFormatting(nodes: TextNode[]) {
  for (const node of nodes) {
    if (!node.characters.trim()) {
      continue;
    }

    await loadFontsForNode(node);
    const translated = await getTranslation([[node.characters]]);
    const nextText = translated[0]?.[0];
    if (nextText) {
      node.characters = nextText;
    }
  }
}

async function translateWithFormatting(nodes: TextNode[]) {
  for (const node of nodes) {
    if (!node.characters.trim()) {
      continue;
    }

    await loadFontsForNode(node);

    const segments = node.getStyledTextSegments(["fontName"]);
    const request = segments.map((segment) => [segment.characters]);
    const response = await getTranslation(request);

    for (let index = segments.length - 1; index >= 0; index--) {
      const segment = segments[index];
      const translatedText = response[index]?.[0];
      if (!segment || !translatedText || translatedText === segment.characters) {
        continue;
      }

      const fontName = segment.fontName;

      node.deleteCharacters(segment.start, segment.end);
      node.insertCharacters(segment.start, translatedText);
      await figma.loadFontAsync(fontName);
      node.setRangeFontName(segment.start, segment.start + translatedText.length, fontName);
    }
  }
}

async function loadFontsForNode(node: TextNode) {
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
    return;
  }

  const length = node.characters.length;
  for (let index = 0; index < length; index++) {
    const fontName = node.getRangeFontName(index, index + 1);
    if (fontName !== figma.mixed) {
      await figma.loadFontAsync(fontName);
    }
  }
}

async function getTranslation(text: string[][]): Promise<string[][]> {
  await new Promise((resolve) => setTimeout(resolve, 500));
  return text.map((row) => convertWordsToLorem(row));
}
