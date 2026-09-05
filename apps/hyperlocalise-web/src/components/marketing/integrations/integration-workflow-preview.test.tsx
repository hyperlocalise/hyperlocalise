// @vitest-environment happy-dom

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
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { IntegrationWorkflowPreview } from "@/components/marketing/integrations/integration-workflow-preview";
import type { VisualWorkflowRfNode } from "@/lib/visual-workflows/schema/types";

vi.mock("@/components/ai-elements/canvas", () => ({
  Canvas: ({ nodes, children }: { nodes: VisualWorkflowRfNode[]; children?: ReactNode }) => (
    <div data-testid="visual-workflow-canvas">
      {nodes.map((node) => (
        <div key={node.id}>{node.data.previewSubtitle}</div>
      ))}
      {children}
    </div>
  ),
}));

vi.mock("@/components/ai-elements/controls", () => ({
  Controls: () => <div>Canvas controls</div>,
}));

const copy = {
  triggerLabel: "Trigger",
  actionLabel: "Action",
  previewHint: "Click a step or use play to preview how the automation runs.",
  playLabel: "Play workflow preview",
  pauseLabel: "Pause workflow preview",
};

describe("IntegrationWorkflowPreview", () => {
  it("shows the selected example on a visual workflow canvas", async () => {
    const user = userEvent.setup();

    render(
      <IntlProvider locale="en" messages={{}}>
        <IntegrationWorkflowPreview
          copy={copy}
          integrationNamesBySlug={{
            github: "GitHub",
            slack: "Slack",
            hyperlocalise: "Hyperlocalise",
          }}
          integrationSlug="github"
          workflows={[
            {
              title: "Catch missing translations before merge",
              steps: [
                { label: "PR opened on GitHub" },
                { label: "Hyperlocalise scans strings" },
                { label: "Reviewer notified in Slack" },
              ],
            },
            {
              title: "Ship localization fixes from review findings",
              steps: [
                { label: "Agent flags untranslated keys" },
                { label: "Translations drafted in Hyperlocalise" },
              ],
            },
          ]}
        />
      </IntlProvider>,
    );

    expect(screen.getAllByText("Catch missing translations before merge").length).toBeGreaterThan(
      0,
    );
    expect(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.getByTestId("visual-workflow-canvas")).toBeInTheDocument();
    expect(screen.getByText("PR opened on GitHub")).toBeInTheDocument();
    expect(screen.getByText("Hyperlocalise scans strings")).toBeInTheDocument();
    expect(screen.getByText("Reviewer notified in Slack")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Ship localization fixes from review findings" }),
    );

    expect(
      screen.getAllByText("Ship localization fixes from review findings").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Agent flags untranslated keys")).toBeInTheDocument();
  });
});
