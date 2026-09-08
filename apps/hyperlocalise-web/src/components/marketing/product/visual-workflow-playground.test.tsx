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
import { render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

const dynamicOptions = vi.hoisted(() => ({ ssr: undefined as boolean | undefined }));

vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, options: { loading?: () => React.ReactNode; ssr?: boolean }) => {
    dynamicOptions.ssr = options.ssr;
    return options.loading ?? (() => null);
  },
}));

import {
  VisualWorkflowPlayground,
  VisualWorkflowPlaygroundLoadingShell,
} from "./visual-workflow-playground";

describe("VisualWorkflowPlayground", () => {
  it("keeps the visual workflow editor out of server rendering", () => {
    expect(dynamicOptions.ssr).toBe(false);
  });

  it("reserves the playground height while the editor loads", () => {
    const markup = renderToStaticMarkup(<VisualWorkflowPlaygroundLoadingShell />);

    expect(markup).toContain("h-[min(36rem,70svh)]");
    expect(markup).toContain("min-h-[28rem]");
    expect(markup).toContain("min-w-0");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("explains that the canvas is an unsaved playground", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <VisualWorkflowPlayground />
      </IntlProvider>,
    );

    expect(screen.getByText("Visual Workflow")).toBeInTheDocument();
    expect(screen.getByText("Try the workflow. Change anything you want.")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This is a playground. Add a step, edit a prompt, press test. Refresh the page and it resets. Nothing is saved.",
      ),
    ).toBeInTheDocument();
    expect(document.body.innerHTML).toContain("min-w-0");
  });
});
