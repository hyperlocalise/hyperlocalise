/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { ContentEditorWorkspaceContainer } from "@/components/content-editor/workspace/content-editor-workspace-container";
import {
  contentEditorSegmentsFixture,
  createContentEditorWorkspaceState,
} from "@/components/content-editor/shared/content-editor.fixture";
import type {
  ContentEditorFormatCheck,
  ContentEditorSegment,
} from "@/components/content-editor/shared/types";
import type { GuidelineCheckFinding } from "@/lib/go-svc/go-svc-guidelines-api";

import {
  EDITOR_GUIDELINE_CHECK_DEBOUNCE_MS,
  guidelineFormatChecks,
  guidelineLimitFormatCheck,
} from "./content-editor-guideline-checks";

const SEGMENT_ID = "seg-02";
const GUIDELINE_LABEL = "Guideline";
const READER_TOKEN = "khách hàng";
const READER_SUGGESTION = "bạn";
const READER_SOURCE = "Hyperlocalise can help you review translations.";
const READER_TARGET = "Hyperlocalise có thể giúp khách hàng duyệt bản dịch.";
const READER_FIXED = "Hyperlocalise có thể giúp bạn duyệt bản dịch.";
const READER_MESSAGE = "Address the reader as bạn, not khách hàng.";
const PRODUCT_SOURCE = "Welcome to Hyperlocalise.";
const PRODUCT_TARGET = "Chào mừng.";
const PRODUCT_MESSAGE = "Keep the product name Hyperlocalise.";
const LIMIT_MESSAGE = "Guideline check limit reached. This translation was not checked.";

const meta = {
  title: "CAT/Guideline check",
  component: ContentEditorWorkspaceContainer,
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "English → Vietnamese (en-US to vi). The guideline says to address the reader as bạn and to keep the product name Hyperlocalise. Findings are warnings: a quoted span can be replaced, and saving stays available.",
      },
    },
  },
  decorators: [
    (Story) => (
      <div className="h-svh min-w-[1100px] bg-background text-foreground">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ContentEditorWorkspaceContainer>;

export default meta;
type Story = StoryObj<typeof meta>;

const missingPlaceholder: ContentEditorFormatCheck = {
  id: "check-format-missing-token",
  label: "Missing placeholders",
  status: "fail",
  message: "Target is missing {name} from the source string.",
  category: "placeholder",
  relatedTokens: ["{name}"],
};

function editorState(input: {
  key: string;
  sourceText: string;
  targetText: string;
  checks: ContentEditorFormatCheck[];
  liveChecks?: ContentEditorFormatCheck[];
  guidelineChecks: (targetText: string) => ContentEditorFormatCheck[];
}): Story["args"] {
  const neighbors: Record<
    string,
    Pick<ContentEditorSegment, "key" | "sourceText" | "targetText" | "contextLabel">
  > = {
    "seg-01": {
      key: "billing.trial.ends",
      sourceText: "Your trial ends tomorrow.",
      targetText: "Bản dùng thử của bạn sẽ kết thúc vào ngày mai.",
      contextLabel: "Billing banner",
    },
    "seg-03": {
      key: "review.queue.open",
      sourceText: "Open the review queue",
      targetText: "Mở hàng đợi phê duyệt",
      contextLabel: "Button",
    },
  };
  const segments = contentEditorSegmentsFixture
    .filter(
      (segment) => segment.id === "seg-01" || segment.id === SEGMENT_ID || segment.id === "seg-03",
    )
    .map((segment) => {
      if (segment.id === SEGMENT_ID) {
        return {
          ...segment,
          key: input.key,
          sourceText: input.sourceText,
          targetText: input.targetText,
          contextLabel: "Assistant prompt",
          maxLength: undefined,
        };
      }
      const neighbor = neighbors[segment.id];
      return neighbor ? { ...segment, ...neighbor, maxLength: undefined } : segment;
    });

  return {
    initialViewMode: "side-by-side",
    initialState: createContentEditorWorkspaceState({
      segments,
      selectedSegmentId: SEGMENT_ID,
      formatChecks: input.checks,
      segmentFormatChecks: { [SEGMENT_ID]: input.checks },
      breadcrumbs: ["Acme", "Product UI", "Jobs", "Translate to Vietnamese"],
      fileContext: {
        sourcePath: "app/assistant/review.tsx",
        filename: "review.tsx",
        sourceLocale: "en-US",
        targetLocale: "vi",
      },
    }),
    services: {
      validateFormat: async () => input.liveChecks ?? [],
      runGuidelineCheck: async (_segment: ContentEditorSegment, value: string) =>
        input.guidelineChecks(value),
    },
  };
}

function finding(
  targetText: string,
  input: Pick<GuidelineCheckFinding, "message" | "start" | "end" | "suggestion" | "severity">,
): ContentEditorFormatCheck[] {
  return guidelineFormatChecks({
    label: GUIDELINE_LABEL,
    targetText,
    result: {
      findings: [
        {
          segmentId: SEGMENT_ID,
          field: "target",
          passageId: "passage-vi-voice",
          ...input,
        },
      ],
    },
  });
}

function readerChecks(targetText: string) {
  const start = targetText.indexOf(READER_TOKEN);
  if (start < 0) {
    return [];
  }
  return finding(targetText, {
    severity: "warning",
    start,
    end: start + READER_TOKEN.length,
    message: READER_MESSAGE,
    suggestion: READER_SUGGESTION,
  });
}

function productNameChecks(targetText: string) {
  return finding(targetText, {
    severity: "info",
    start: 0,
    end: targetText.length,
    message: PRODUCT_MESSAGE,
  });
}

const limitWarning = guidelineLimitFormatCheck(GUIDELINE_LABEL, LIMIT_MESSAGE);

export const AddressTheReader: Story = {
  name: "Address the reader as bạn",
  args: editorState({
    key: "assistant.review.help",
    sourceText: READER_SOURCE,
    targetText: READER_TARGET,
    checks: readerChecks(READER_TARGET),
    guidelineChecks: readerChecks,
  }),
  parameters: {
    docs: {
      description: {
        story:
          "The Vietnamese guideline says to address the reader as bạn. The translation says khách hàng, so the check quotes that span and suggests bạn.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(
      async () => {
        await expect(
          canvas.queryByRole("status", { name: "Checking format & QA" }),
        ).not.toBeInTheDocument();
        await expect(canvas.getByText(GUIDELINE_LABEL)).toBeInTheDocument();
      },
      { timeout: 4_000 },
    );
    await expect(canvas.getByText(/Address the reader as bạn/)).toBeInTheDocument();
    await expect(canvas.getByText(/Suggested:/)).toBeInTheDocument();
    await expect(canvas.getByRole("button", { name: "Fix" })).toBeInTheDocument();
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-qa-highlight]")).toHaveTextContent(READER_TOKEN),
    );

    await new Promise((resolve) => setTimeout(resolve, EDITOR_GUIDELINE_CHECK_DEBOUNCE_MS));
    await expect(canvas.getByText(GUIDELINE_LABEL)).toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-qa-highlight]")).toHaveTextContent(
      READER_TOKEN,
    );
    await expect(canvas.getByRole("textbox", { name: "Target translation" })).toHaveTextContent(
      READER_TARGET,
    );
  },
};

export const ApplySuggestion: Story = {
  name: "Replace khách hàng with bạn",
  args: editorState({
    key: "assistant.review.help",
    sourceText: READER_SOURCE,
    targetText: READER_TARGET,
    checks: readerChecks(READER_TARGET),
    guidelineChecks: readerChecks,
  }),
  parameters: {
    docs: {
      description: {
        story:
          "Fix replaces khách hàng with bạn. The warning clears because the Vietnamese translation now follows the guideline.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByRole("button", { name: "Fix" })).toBeInTheDocument(), {
      timeout: 4_000,
    });

    await userEvent.click(canvas.getByRole("button", { name: "Fix" }));
    await waitFor(() =>
      expect(canvas.getByRole("textbox", { name: "Target translation" })).toHaveTextContent(
        READER_FIXED,
      ),
    );
    await waitFor(
      async () => {
        await expect(canvas.queryByText(GUIDELINE_LABEL)).not.toBeInTheDocument();
        await expect(canvasElement.querySelector("[data-qa-highlight]")).toBeNull();
      },
      { timeout: 4_000 },
    );
  },
};

export const ProductNameOmitted: Story = {
  name: "Product name omitted",
  args: editorState({
    key: "onboarding.welcome",
    sourceText: PRODUCT_SOURCE,
    targetText: PRODUCT_TARGET,
    checks: productNameChecks(PRODUCT_TARGET),
    guidelineChecks: productNameChecks,
  }),
  parameters: {
    docs: {
      description: {
        story:
          "The source names Hyperlocalise. The Vietnamese translation drops it, so the check warns without a span to replace.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => expect(canvas.getByText(GUIDELINE_LABEL)).toBeInTheDocument(), {
      timeout: 4_000,
    });
    await expect(canvas.getByText(/Keep the product name Hyperlocalise/)).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Fix" })).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-qa-highlight]")).toBeNull();
    await expect(canvas.getByRole("textbox", { name: "Target translation" })).toHaveTextContent(
      PRODUCT_TARGET,
    );
  },
};

export const LimitReached: Story = {
  name: "Check limit reached",
  args: editorState({
    key: "assistant.review.help",
    sourceText: READER_SOURCE,
    targetText: READER_TARGET,
    checks: [limitWarning],
    guidelineChecks: () => [limitWarning],
  }),
  parameters: {
    docs: {
      description: {
        story: "The plan limit was reached, so this Vietnamese translation was not checked.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(
      () => expect(canvas.getByText(/Guideline check limit reached/)).toBeInTheDocument(),
      { timeout: 4_000 },
    );
    await expect(canvas.queryByRole("button", { name: "Fix" })).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("[data-qa-highlight]")).toBeNull();
  },
};

export const BesideFormatFailure: Story = {
  name: "Beside a missing placeholder",
  args: editorState({
    key: "assistant.review.help",
    sourceText: "Hyperlocalise can help {name} review translations.",
    targetText: READER_TARGET,
    checks: [missingPlaceholder, ...readerChecks(READER_TARGET)],
    liveChecks: [missingPlaceholder],
    guidelineChecks: readerChecks,
  }),
  parameters: {
    docs: {
      description: {
        story:
          "The Vietnamese target is also missing {name}. The format failure stays first, and the bạn warning is the extra issue. Saving stays available.",
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(
      () => expect(canvas.getByRole("button", { name: "+1 more" })).toBeInTheDocument(),
      {
        timeout: 4_000,
      },
    );

    await expect(canvas.getByText("Missing placeholders")).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Fix" })).not.toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "+1 more" }));
    await expect(
      canvas.getByText(`${READER_MESSAGE} Suggestion: ${READER_SUGGESTION}`),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("textbox", { name: "Target translation" })).toBeEnabled();
  },
};
