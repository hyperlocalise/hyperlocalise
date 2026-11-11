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
import { normalizeSegmentText } from "./segment-normalize";
import { loadFontsForTextNodes } from "./load-text-node-fonts";
import { createFigmaSegment, readStampedSegmentKey } from "./segment-file";
import { clampPluginUiHeight, PLUGIN_UI_WIDTH } from "./plugin-ui-size";
import { hadLegacyFigmaSession, mergeSettings } from "./settings";
import {
  clearPreviewSource,
  collectDesignFrames,
  countPreviewedNodes,
  exportDesignFrame,
  previewTranslations,
  readFileLink,
  readSelectedDesignText,
  restorePreviewSource,
  saveFileLink,
  scanDesignText,
  selectNodes,
  sourceTextOf,
  writeKeyLinks,
} from "./design-sandbox";

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
      const textNodes = msg.wholePage ? collectAllTextNodesOnPage(page) : collectTextNodes(page);
      const segments = extractSegments(textNodes);
      postToUi({ type: "extracted", segments, file: fileInfoForPage(page) });
      return;
    }

    if (msg.type === "apply") {
      const page = await requirePage(msg.pageId);
      const textNodes = collectAllTextNodesOnPage(page);
      const count = await applyTranslations(textNodes, msg.translations, msg.sourceByKey);
      postToUi({ type: "applied", count });
      return;
    }

    if (msg.type === "design-scan") {
      const page = await requirePage(msg.pageId);
      postToUi({
        type: "design-scanned",
        nodes: scanDesignText(page, msg.selectionOnly),
        fileLink: readFileLink(),
        figmaFileKey: figma.fileKey ?? null,
        previewing: countPreviewedNodes(page),
      });
      return;
    }

    if (msg.type === "design-selection") {
      const page = await requirePage(msg.pageId);
      postToUi({ type: "design-selection-read", nodes: readSelectedDesignText(page) });
      return;
    }

    if (msg.type === "design-link") {
      postToUi({ type: "design-linked", count: await writeKeyLinks(msg.links) });
      return;
    }

    if (msg.type === "design-frames") {
      const page = await requirePage(msg.pageId);
      postToUi({ type: "design-frames-read", ...collectDesignFrames(page) });
      return;
    }

    if (msg.type === "design-export-frame") {
      postToUi({ type: "design-frame-exported", frame: await exportDesignFrame(msg.frame) });
      return;
    }

    if (msg.type === "design-preview") {
      const page = await requirePage(msg.pageId);
      postToUi({
        type: "design-previewed",
        ...(await previewTranslations(page, msg.translations)),
      });
      return;
    }

    if (msg.type === "design-restore") {
      const page = await requirePage(msg.pageId);
      postToUi({ type: "design-restored", count: await restorePreviewSource(page) });
      return;
    }

    if (msg.type === "design-select-nodes") {
      postToUi({ type: "design-nodes-selected", count: await selectNodes(msg.nodeIds) });
      return;
    }

    if (msg.type === "design-file-link-set") {
      saveFileLink(msg.url);
      postToUi({ type: "design-file-link-saved" });
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
  // `dynamic-page` only loads the current page; `findAll` throws on other pages until loaded.
  await page.loadAsync();
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
    // A design-context preview keeps the real source text in plugin data.
    const text = sourceTextOf(node);
    if (!text.trim()) {
      continue;
    }

    segments.push(
      createFigmaSegment({
        node,
        regionIndex: 0,
        text: normalizeSegmentText(text),
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
  const updates: Array<{ node: TextNode; nextText: string }> = [];

  for (const node of nodes) {
    // During a design-context preview the canvas shows a translation; match on the source.
    const nodeText = sourceTextOf(node);
    if (!nodeText.trim()) {
      continue;
    }

    const stampedKey = readStampedSegmentKey(node);
    const nextText = resolveFigmaApplyTarget({
      nodeText,
      stampedKey,
      translations,
      textIndex,
      sourceByKey,
    });
    if (!nextText) {
      continue;
    }
    if (nextText === node.characters) {
      clearPreviewSource(node);
      continue;
    }

    updates.push({ node, nextText });
  }

  const writable = updates.filter((entry) => !entry.node.hasMissingFont);
  const skippedMissingFont = updates.length - writable.length;
  if (skippedMissingFont > 0) {
    figma.notify(
      `Skipped ${skippedMissingFont} text ${skippedMissingFont === 1 ? "layer" : "layers"} with missing fonts.`,
    );
  }

  if (writable.length === 0) {
    return 0;
  }

  await loadFontsForTextNodes(writable.map((entry) => entry.node));

  for (const { node, nextText } of writable) {
    node.characters = nextText;
    // Apply supersedes a design-context preview; Restore must not undo it.
    clearPreviewSource(node);
    applied += 1;
  }

  return applied;
}
