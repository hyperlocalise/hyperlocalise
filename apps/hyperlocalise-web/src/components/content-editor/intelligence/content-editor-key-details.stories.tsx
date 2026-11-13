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
import { useMemo, useState } from "react";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn, userEvent, waitFor } from "storybook/test";

import {
  ContentEditorKeyDetails,
  ContentEditorKeyDetailsEditingContext,
  ContentEditorKeyTagFilterContext,
  type ContentEditorKeyDetailsEditing,
} from "./content-editor-key-details";

const FIGMA_URL = "https://www.figma.com/design/AbC123/Checkout-v3?node-id=12-34";
const SAVE_DELAY_MS = 600;

type HarnessProps = {
  tags: string[];
  designUrl?: string;
  /** "none" renders without the editing context, as for someone who can't edit. */
  mode: "none" | "editable" | "saving" | "failing";
  onSetTags: ContentEditorKeyDetailsEditing["onSetTags"];
  onSetDesignUrl: ContentEditorKeyDetailsEditing["onSetDesignUrl"];
  onFilterByTag: (tag: string) => void;
};

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Keeps tags and the link in local state so the stories behave like the editor. */
function KeyDetailsHarness({
  tags: initialTags,
  designUrl: initialDesignUrl,
  mode,
  onSetTags,
  onSetDesignUrl,
  onFilterByTag,
}: HarnessProps) {
  const [tags, setTags] = useState(initialTags);
  const [designUrl, setDesignUrl] = useState(initialDesignUrl);
  const [isSaving, setIsSaving] = useState(mode === "saving");

  const editing = useMemo<ContentEditorKeyDetailsEditing | null>(() => {
    if (mode === "none") {
      return null;
    }
    async function run(apply: () => void) {
      setIsSaving(true);
      try {
        await wait(SAVE_DELAY_MS);
        if (mode === "failing") {
          throw new Error("");
        }
        apply();
      } finally {
        setIsSaving(mode === "saving");
      }
    }
    return {
      isSaving,
      canEditSegment: () => true,
      onSetTags: async (input) => {
        void onSetTags(input);
        await run(() =>
          setTags((current) => [
            ...current.filter((tag) => !input.removeTags.includes(tag)),
            ...input.addTags.filter((tag) => !current.includes(tag)),
          ]),
        );
      },
      onSetDesignUrl: async (input) => {
        void onSetDesignUrl(input);
        await run(() => setDesignUrl(input.designUrl ?? undefined));
      },
    };
  }, [isSaving, mode, onSetDesignUrl, onSetTags]);

  return (
    <ContentEditorKeyTagFilterContext.Provider value={onFilterByTag}>
      <ContentEditorKeyDetailsEditingContext.Provider value={editing}>
        <ContentEditorKeyDetails segmentId="key-1" tags={tags} designUrl={designUrl} />
      </ContentEditorKeyDetailsEditingContext.Provider>
    </ContentEditorKeyTagFilterContext.Provider>
  );
}

const meta = {
  title: "CAT/Translation Intelligence/Key details",
  component: KeyDetailsHarness,
  parameters: {
    layout: "padded",
  },
  decorators: [
    (Story) => (
      <div className="mx-auto max-w-sm rounded-xl border border-border bg-background p-3.5 text-foreground">
        <Story />
      </div>
    ),
  ],
  args: {
    tags: [],
    mode: "editable",
    onSetTags: fn(),
    onSetDesignUrl: fn(),
    onFilterByTag: fn(),
  },
  argTypes: {
    mode: {
      control: "inline-radio",
      options: ["none", "editable", "saving", "failing"],
    },
  },
} satisfies Meta<typeof KeyDetailsHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReadOnly: Story = {
  args: {
    mode: "none",
    tags: ["release-7", "checkout"],
    designUrl: FIGMA_URL,
  },
};

export const EditableEmpty: Story = {
  args: {
    mode: "editable",
  },
  play: async ({ canvas, args }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Add tag" }));
    await userEvent.type(canvas.getByRole("textbox", { name: "Add tags" }), "checkout{Enter}");
    await waitFor(() =>
      expect(args.onSetTags).toHaveBeenCalledWith({
        segmentIds: ["key-1"],
        addTags: ["checkout"],
        removeTags: [],
      }),
    );
    await userEvent.keyboard("{Escape}");
    await expect(await canvas.findByText("checkout")).toBeInTheDocument();
  },
};

export const EditableFilled: Story = {
  args: {
    mode: "editable",
    tags: ["release-7", "checkout", "onboarding"],
    designUrl: FIGMA_URL,
  },
};

export const OtherDesignLink: Story = {
  args: {
    mode: "editable",
    tags: ["marketing"],
    designUrl: "https://zeroheight.example.com/styleguide/buttons",
  },
};

export const Saving: Story = {
  args: {
    mode: "saving",
    tags: ["release-7"],
    designUrl: FIGMA_URL,
  },
};

export const SaveFails: Story = {
  args: {
    mode: "failing",
    tags: ["release-7"],
  },
};
