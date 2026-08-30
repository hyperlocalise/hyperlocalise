import type { FigmaFileInfo, SandboxToUiMessage, UiToSandboxMessage } from "./plugin-messages";
import { SETTINGS_STORAGE_KEY } from "./plugin-messages";
import {
  PAGE_BINDING_KEY,
  parsePageJobBinding,
  serializePageJobBinding,
  type FigmaPageJobBinding,
} from "./page-binding";
import { createFigmaSegment } from "./segment-file";
import { hadLegacyFigmaSession, mergeSettings } from "./settings";

figma.showUI(__html__, { themeColors: true, width: 360, height: 720 });

figma.on("currentpagechange", () => {
  postToUi({ type: "page-changed", file: currentFileInfo(), binding: readPageBinding() });
});

figma.ui.onmessage = async (msg: UiToSandboxMessage) => {
  try {
    if (msg.type === "cancel") {
      figma.closePlugin();
      return;
    }

    if (msg.type === "boot") {
      const stored = await figma.clientStorage.getAsync(SETTINGS_STORAGE_KEY);
      const legacySessionCleared = hadLegacyFigmaSession(stored);
      const settings = mergeSettings(stored);
      if (legacySessionCleared) {
        await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, settings);
      }
      postToUi({
        type: "ready",
        settings,
        file: currentFileInfo(),
        binding: readPageBinding(),
        legacySessionCleared,
      });
      return;
    }

    if (msg.type === "storage-set") {
      await figma.clientStorage.setAsync(SETTINGS_STORAGE_KEY, msg.settings);
      return;
    }

    if (msg.type === "binding-set") {
      await writePageBinding(msg.pageId, msg.binding);
      return;
    }

    if (msg.type === "binding-clear") {
      const page = await pageNode(msg.pageId);
      if (page) {
        page.setPluginData(PAGE_BINDING_KEY, "");
      }
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

function readPageBinding(): FigmaPageJobBinding | null {
  return parsePageJobBinding(figma.currentPage.getPluginData(PAGE_BINDING_KEY));
}

async function pageNode(pageId: string): Promise<PageNode | null> {
  if (figma.currentPage.id === pageId) {
    return figma.currentPage;
  }

  const node = await figma.getNodeByIdAsync(pageId);
  return node?.type === "PAGE" ? node : null;
}

async function writePageBinding(pageId: string, binding: FigmaPageJobBinding) {
  const page = await pageNode(pageId);
  if (!page) {
    return;
  }
  page.setPluginData(PAGE_BINDING_KEY, serializePageJobBinding(binding));
}

function postToUi(message: SandboxToUiMessage) {
  figma.ui.postMessage(message);
}

const LOCAL_FILE_ID_KEY = "hyperlocalise:file-id";

function resolveFileKey(): string {
  if (figma.fileKey) {
    return figma.fileKey;
  }

  const existing = figma.root.getPluginData(LOCAL_FILE_ID_KEY);
  if (existing) {
    return existing;
  }

  const generated =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? `local-${crypto.randomUUID()}`
      : `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  figma.root.setPluginData(LOCAL_FILE_ID_KEY, generated);
  return generated;
}

function currentFileInfo(): FigmaFileInfo {
  return {
    fileKey: resolveFileKey(),
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
