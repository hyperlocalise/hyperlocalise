import type {
  FigmaFileInfo,
  FigmaPageOption,
  SandboxToUiMessage,
  UiToSandboxMessage,
} from "./plugin-messages";
import { SETTINGS_STORAGE_KEY } from "./plugin-messages";
import {
  PAGE_BINDING_KEY,
  parsePageJobBinding,
  serializePageJobBinding,
  type FigmaPageJobBinding,
} from "./page-binding";
import { buildFigmaApplyTextIndex, resolveFigmaApplyTarget } from "./apply-translations";
import { createFigmaSegment, readStampedSegmentKey } from "./segment-file";
import { clampPluginUiHeight, PLUGIN_UI_WIDTH } from "./plugin-ui-size";
import { hadLegacyFigmaSession, mergeSettings } from "./settings";

figma.showUI(__html__, {
  themeColors: true,
  width: PLUGIN_UI_WIDTH,
  height: clampPluginUiHeight(280),
});

figma.on("currentpagechange", () => {
  postToUi({
    type: "page-changed",
    file: currentFileInfo(),
    pages: listPages(),
    binding: readPageBinding(),
  });
});

figma.ui.onmessage = async (msg: UiToSandboxMessage) => {
  try {
    if (msg.type === "cancel") {
      figma.closePlugin();
      return;
    }

    if (msg.type === "resize-ui") {
      figma.ui.resize(PLUGIN_UI_WIDTH, clampPluginUiHeight(msg.height));
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
        pages: listPages(),
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

    if (msg.type === "binding-read") {
      const page = await pageNode(msg.pageId);
      postToUi({
        type: "binding-loaded",
        pageId: msg.pageId,
        binding: page ? readPageBindingOnPage(page) : null,
      });
      return;
    }

    if (msg.type === "extract") {
      const page = await requirePage(msg.pageId);
      const textNodes = collectTextNodes(page);
      const segments = extractSegments(textNodes);
      postToUi({ type: "extracted", segments, file: fileInfoForPage(page) });
      return;
    }

    if (msg.type === "apply") {
      const page = await requirePage(msg.pageId);
      const textNodes = collectAllTextNodesOnPage(page);
      const count = await applyTranslations(textNodes, msg.translations, msg.sourceByKey);
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
  return readPageBindingOnPage(figma.currentPage);
}

function readPageBindingOnPage(page: PageNode): FigmaPageJobBinding | null {
  return parsePageJobBinding(page.getPluginData(PAGE_BINDING_KEY));
}

function listPages(): FigmaPageOption[] {
  return figma.root.children
    .filter((node): node is PageNode => node.type === "PAGE")
    .map((page) => ({
      pageId: page.id,
      pageName: page.name,
    }));
}

async function requirePage(pageId: string): Promise<PageNode> {
  const page = await pageNode(pageId);
  if (!page) {
    throw new Error("Page not found.");
  }
  return page;
}

function fileInfoForPage(page: PageNode): FigmaFileInfo {
  return {
    fileKey: resolveFileKey(),
    fileName: figma.root.name,
    pageId: page.id,
    pageName: page.name,
  };
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

  const webCrypto = globalThis.crypto;
  const generated =
    webCrypto && typeof webCrypto.randomUUID === "function"
      ? `local-${webCrypto.randomUUID()}`
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

function collectTextNodes(page: PageNode): TextNode[] {
  const selected = page.selection.flatMap((node) => {
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

  return collectAllTextNodesOnPage(page);
}

function collectAllTextNodesOnPage(page: PageNode): TextNode[] {
  return page.findAll((node) => node.type === "TEXT") as TextNode[];
}

function extractSegments(nodes: TextNode[]) {
  const segments = [];

  for (const node of nodes) {
    if (!node.characters.trim()) {
      continue;
    }

    segments.push(
      createFigmaSegment({
        node,
        regionIndex: 0,
        text: node.characters,
      }),
    );
  }

  return segments;
}

async function applyTranslations(
  nodes: TextNode[],
  translations: Record<string, string>,
  sourceByKey: Record<string, string>,
) {
  let applied = 0;
  const textIndex = buildFigmaApplyTextIndex({ sourceByKey, translations });

  for (const node of nodes) {
    if (!node.characters.trim()) {
      continue;
    }

    const nextText = resolveFigmaApplyTarget({
      nodeText: node.characters,
      stampedKey: readStampedSegmentKey(node),
      translations,
      textIndex,
    });
    if (!nextText || nextText === node.characters) {
      continue;
    }

    await loadFontsForNode(node);
    node.characters = nextText;
    applied += 1;
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
