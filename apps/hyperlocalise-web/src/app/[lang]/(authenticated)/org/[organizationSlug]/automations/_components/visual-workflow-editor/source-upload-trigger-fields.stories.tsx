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
import { useState } from "react";

import type { VisualWorkflowSourceUploadTriggerConfig } from "@/lib/visual-workflows/schema/types";

import { SourceUploadTriggerFields } from "./source-upload-trigger-fields";

function Playground({ initial }: { initial: VisualWorkflowSourceUploadTriggerConfig }) {
  const [config, setConfig] = useState(initial);
  return (
    <div className="w-[360px] rounded-xl border border-border bg-card p-4">
      <SourceUploadTriggerFields config={config} onChangeConfig={setConfig} />
    </div>
  );
}

const meta = {
  title: "App/Automations/Visual workflow/Source upload settings",
  component: Playground,
  args: { initial: { kind: "trigger.source_upload" } },
} satisfies Meta<typeof Playground>;

export default meta;
type Story = StoryObj<typeof meta>;

export const EveryFile: Story = {};

export const GlobPatterns: Story = {
  args: {
    initial: {
      kind: "trigger.source_upload",
      pathPatterns: ["locales/en/**/*.json", "*.{md,mdx}"],
    },
  },
};

export const RegexWithAnError: Story = {
  args: {
    initial: {
      kind: "trigger.source_upload",
      uploads: "new",
      pathSyntax: "regex",
      pathPatterns: ["^locales/en/.*\\.json$", "(unclosed"],
    },
  },
};
