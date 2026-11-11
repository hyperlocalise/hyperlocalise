import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/preact";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { DesignContextPanel, type DesignContextPanelProps } from "./design-context-panel";
import type { SandboxToUiMessage, UiToSandboxMessage } from "./plugin-messages";

const keyId = "6f1c1f9e-8a7b-4c39-9d1f-3a8f2b1c0d11";
const matchedKey = {
  id: keyId,
  key: "checkout.title",
  sourcePath: "locales/en.json",
  sourceText: "Checkout",
  maxLength: 12,
};

type SandboxHandler = (message: UiToSandboxMessage) => SandboxToUiMessage | null;

function mockSandbox(handler: SandboxHandler) {
  const sent: UiToSandboxMessage[] = [];
  vi.spyOn(parent, "postMessage").mockImplementation((data: unknown) => {
    const message = (data as { pluginMessage: UiToSandboxMessage }).pluginMessage;
    sent.push(message);
    const reply = handler(message);
    if (reply) {
      queueMicrotask(() => {
        window.dispatchEvent(new MessageEvent("message", { data: { pluginMessage: reply } }));
      });
    }
  });
  return sent;
}

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function renderPanel(overrides: Partial<DesignContextPanelProps> = {}) {
  const showToast = vi.fn();
  const props: DesignContextPanelProps = {
    appUrl: "http://localhost:3000",
    auth: { connectionToken: "hl_figma_test" },
    project: { id: "proj_1", name: "App", sourceLocale: "en", targetLocales: ["fr-FR"] },
    pageId: "page-1",
    fileName: "Checkout flow",
    locale: "fr-FR",
    disabled: false,
    run: async (work) => {
      try {
        await work();
      } catch (error) {
        showToast(error instanceof Error ? error.message : String(error), "critical");
      }
    },
    showToast,
    ...overrides,
  };
  render(<DesignContextPanel {...props} />);
  return { showToast };
}

const textNode = {
  nodeId: "1:2",
  text: "Checkout",
  layerName: "Title",
  frameId: "1:1",
  frameName: "Checkout",
  link: null,
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("DesignContextPanel", () => {
  it("matches layers to project keys and links unique matches", async () => {
    const sent = mockSandbox((message) => {
      if (message.type === "design-scan") {
        return {
          type: "design-scanned",
          nodes: [textNode],
          fileLink: null,
          figmaFileKey: null,
          previewing: 0,
        };
      }
      if (message.type === "design-link") {
        return { type: "design-linked", count: message.links.length };
      }
      return null;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        matches: [
          { nodeId: "1:2", matchedBy: "source_text", key: matchedKey, candidates: [matchedKey] },
        ],
      }),
    );
    const { showToast } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Match keys" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith("Linked 1 new layer.", "positive");
    });
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "http://localhost:3000/api/integrations/figma/keys/match",
    );
    expect(sent).toContainEqual({
      type: "design-link",
      links: [
        {
          nodeId: "1:2",
          link: { id: keyId, key: "checkout.title", sourcePath: "locales/en.json", maxLength: 12 },
        },
      ],
    });
  });

  it("asks for the Figma file link before syncing", async () => {
    mockSandbox((message) =>
      message.type === "design-scan"
        ? { type: "design-scanned", nodes: [], fileLink: null, figmaFileKey: null, previewing: 0 }
        : null,
    );
    const { showToast } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Sync to editor" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Paste this file's Figma link first (Share → Copy link).",
        "critical",
      );
    });
  });

  it("syncs each frame with its Figma link", async () => {
    const frame = {
      nodeId: "1:1",
      name: "Checkout",
      bindings: [{ translationKeyId: keyId, marker: { left: 10, top: 10, width: 50, height: 5 } }],
    };
    mockSandbox((message) => {
      if (message.type === "design-scan") {
        return {
          type: "design-scanned",
          nodes: [],
          fileLink: "https://www.figma.com/design/AbCdEf123456/Checkout",
          figmaFileKey: null,
          previewing: 0,
        };
      }
      if (message.type === "design-file-link-set") {
        return { type: "design-file-link-saved" };
      }
      if (message.type === "design-frames") {
        return { type: "design-frames-read", frames: [frame], unframed: 0, previewing: 0 };
      }
      if (message.type === "design-export-frame") {
        return {
          type: "design-frame-exported",
          frame: { ...frame, contentType: "image/png", imageBase64: "iVBORw0KGgo=" },
        };
      }
      return null;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        visualContext: {
          screenshotId: "s1",
          boundCount: 1,
          skippedCount: 0,
          replacedFrame: true,
        },
      }),
    );
    const { showToast } = renderPanel();

    await waitFor(() => {
      expect(screen.getByDisplayValue(/AbCdEf123456/)).toBeTruthy();
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync to editor" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Synced 1 frame for 1 keys. Linguists now see them in the editor.",
        "positive",
      );
    });
    const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body).toMatchObject({
      projectId: "proj_1",
      fileKey: "AbCdEf123456",
      nodeId: "1:1",
      figmaUrl: "https://www.figma.com/design/AbCdEf123456/Checkout-flow?node-id=1-1",
      contentType: "image/png",
    });
  });

  it("previews translations and reports layers that no longer fit", async () => {
    mockSandbox((message) => {
      if (message.type === "design-scan") {
        return {
          type: "design-scanned",
          nodes: [
            {
              ...textNode,
              link: { id: keyId, key: "checkout.title", sourcePath: null, maxLength: 12 },
            },
          ],
          fileLink: null,
          figmaFileKey: "AbCdEf123456",
          previewing: 0,
        };
      }
      if (message.type === "design-preview") {
        return {
          type: "design-previewed",
          applied: 1,
          missing: 0,
          issues: [
            {
              nodeId: "1:2",
              keyId,
              key: "checkout.title",
              overflow: true,
              overLimit: true,
              length: 18,
              maxLength: 12,
            },
          ],
        };
      }
      return null;
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(() =>
      jsonResponse({
        translations: [
          {
            keyId,
            text: "Passer la commande",
            status: "approved",
            maxLength: 12,
            sourceText: "Checkout",
          },
        ],
      }),
    );
    const { showToast } = renderPanel();

    fireEvent.click(screen.getByRole("button", { name: /^Preview/ }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(expect.stringContaining("1 overflow its box"), "warn");
    });
    expect(screen.getByText("Select layers")).toBeTruthy();
    expect(screen.queryByPlaceholderText("https://www.figma.com/design/…")).toBeNull();
  });

  it("refuses to sync while a translation preview is on the canvas", async () => {
    mockSandbox((message) => {
      if (message.type === "design-scan") {
        return {
          type: "design-scanned",
          nodes: [],
          fileLink: null,
          figmaFileKey: "AbCdEf123456",
          previewing: 0,
        };
      }
      if (message.type === "design-frames") {
        return { type: "design-frames-read", frames: [], unframed: 0, previewing: 2 };
      }
      return null;
    });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const { showToast } = renderPanel();

    await waitFor(() => {
      expect(screen.queryByPlaceholderText("https://www.figma.com/design/…")).toBeNull();
    });
    fireEvent.click(screen.getByRole("button", { name: "Sync to editor" }));

    await waitFor(() => {
      expect(showToast).toHaveBeenCalledWith(
        "Restore source before syncing, so the editor shows the source design.",
        "critical",
      );
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Restore source" }).hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("keeps Restore available for a preview left from an earlier session", async () => {
    mockSandbox((message) =>
      message.type === "design-scan"
        ? {
            type: "design-scanned",
            nodes: [],
            fileLink: null,
            figmaFileKey: "AbCdEf123456",
            previewing: 3,
          }
        : null,
    );
    renderPanel();

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Restore source" }).hasAttribute("disabled")).toBe(
        false,
      );
    });
  });
});
