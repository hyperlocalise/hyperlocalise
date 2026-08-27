import type { FigmaFileInfo, SandboxToUiMessage, UiToSandboxMessage } from "./plugin-messages";
import { SETTINGS_STORAGE_KEY } from "./plugin-messages";
import { createFigmaSegment } from "./segment-file";
import { mergeSettings } from "./settings";

figma.showUI(__html__, { themeColors: true, width: 360, height: 620 });

figma.ui.onmessage = async (msg: UiToSandboxMessage) => {
  try {
    if (msg.type === "cancel") {
      figma.closePlugin();
      return;
    }

    if (msg.type === "boot") {
      const settings = mergeSettings(await figma.clientStorage.getAsync(SETTINGS_STORAGE_KEY));
      postToUi({ type: "ready", settings, file: currentFileInfo() });
      return;
    }

    if (msg.type === "storage-set") {
      await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, msg.settings);
      return;
    }

    if (msg.type === "extract") {
      const textNodes = collectTextNodes();
      const segments = extractSegments(textNodes, msg.preserveFormatting);
      postToUi({ type: "extracted", segments, file: currentFileInfo() });
      return;
    }

    if (msg.type === "apply") {
      const textNodes = collectTextNodes();
      const count = await applyTranslations(textNodes, msg.translations, msg.preserveFormatting);
      postToUi({ type: "applied", count });
    }
  } catch (error) {
    postToUi({
      type: "error",
      message: error instanceof Error ? error.message : "Figma plugin action failed.",
    });
  }
};

function postToUi(message: SandboxToUiMessage) {
  figma.ui.postMessage(message);
}

function currentFileInfo(): FigmaFileInfo {
  return {
    fileKey: figma.fileKey ?? "local-file",
    fileName: figma.root.name,
    pageId: figma.currentPage.id,
    pageName: figma.currentPage.name,
  };
}

function collectTextNodes(): TextNode[] {
  const selected = figma.currentPage.selection.flatMap((node) => {
    if (node.type === "TEXT") {
      return [node];
    }
    if ("findAll" in node) {
      return node.findAll((child) => child.type === "TEXT") as TextNode[];
    }
    return [];
  });

  if (selected.length > 0) {
    return selected;
  }

  return figma.currentPage.findAll((node) => node.type === "TEXT") as TextNode[];
}

function extractSegments(nodes: TextNode[], preserveFormatting: boolean) {
  const segments = [];

  for (const node of nodes) {
    if (!node.characters.trim()) {
      continue;
    }

    if (!preserveFormatting) {
      segments.push(
        createFigmaSegment({
          nodeId: node.id,
          regionIndex: 0,
          text: node.characters,
        }),
      );
      continue;
    }

    const styled = node.getStyledTextSegments(["fontName"]);
    styled.forEach((segment, regionIndex) => {
      if (!segment.characters.trim()) {
        return;
      }
      segments.push(
        createFigmaSegment({
          nodeId: node.id,
          regionIndex,
          text: segment.characters,
        }),
      );
    });
  }

  return segments;
}

async function applyTranslations(
  nodes: TextNode[],
  translations: Record<string, string>,
  preserveFormatting: boolean,
) {
  let applied = 0;

  for (const node of nodes) {
    if (!node.characters.trim()) {
      continue;
    }

    await loadFontsForNode(node);

    if (!preserveFormatting) {
      const nextText =
        translations[
          createFigmaSegment({
            nodeId: node.id,
            regionIndex: 0,
            text: node.characters,
          }).key
        ];
      if (!nextText || nextText === node.characters) {
        continue;
      }
      node.characters = nextText;
      applied += 1;
      continue;
    }

    const styled = node.getStyledTextSegments(["fontName"]);
    for (let index = styled.length - 1; index >= 0; index -= 1) {
      const segment = styled[index];
      if (!segment) {
        continue;
      }
      const nextText =
        translations[
          createFigmaSegment({
            nodeId: node.id,
            regionIndex: index,
            text: segment.characters,
          }).key
        ];
      if (!nextText || nextText === segment.characters) {
        continue;
      }

      node.deleteCharacters(segment.start, segment.end);
      node.insertCharacters(segment.start, nextText);
      await figma.loadFontAsync(segment.fontName);
      node.setRangeFontName(segment.start, segment.start + nextText.length, segment.fontName);
      applied += 1;
    }
  }

  return applied;
}

async function loadFontsForNode(node: TextNode) {
  if (node.fontName !== figma.mixed) {
    await figma.loadFontAsync(node.fontName);
    return;
  }

  const length = node.characters.length;
  for (let index = 0; index < length; index += 1) {
    const fontName = node.getRangeFontName(index, index + 1);
    if (fontName !== figma.mixed) {
      await figma.loadFontAsync(fontName);
    }
  }
}
