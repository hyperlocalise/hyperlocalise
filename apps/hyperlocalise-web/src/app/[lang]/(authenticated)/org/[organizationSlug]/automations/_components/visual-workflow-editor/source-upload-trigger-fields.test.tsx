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
// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import type { VisualWorkflowSourceUploadTriggerConfig } from "@/lib/visual-workflows/schema/types";

import { SourceUploadTriggerFields } from "./source-upload-trigger-fields";

function Harness({
  initial,
  onChange,
}: {
  initial: VisualWorkflowSourceUploadTriggerConfig;
  onChange: (config: VisualWorkflowSourceUploadTriggerConfig) => void;
}) {
  const [config, setConfig] = useState(initial);
  return (
    <SourceUploadTriggerFields
      config={config}
      onChangeConfig={(next) => {
        setConfig(next);
        onChange(next);
      }}
    />
  );
}

function renderFields(
  initial: VisualWorkflowSourceUploadTriggerConfig = { kind: "trigger.source_upload" },
) {
  const onChange = vi.fn();
  render(
    <IntlProvider locale="en" messages={{}}>
      <Harness initial={initial} onChange={onChange} />
    </IntlProvider>,
  );
  return { onChange, user: userEvent.setup() };
}

describe("SourceUploadTriggerFields", () => {
  it("adds an example pattern and shows whether a path would start the workflow", async () => {
    const { onChange, user } = renderFields();

    expect(screen.getByText(/Every file starts the workflow/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Add **/*.json" }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "trigger.source_upload",
      pathPatterns: ["**/*.json"],
    });

    const tryPath = screen.getByRole("textbox", { name: "Try a path" });
    await user.type(tryPath, "locales/en/app.json");
    expect(screen.getByText("Starts the workflow")).toBeTruthy();

    await user.clear(tryPath);
    await user.type(tryPath, "docs/readme.md");
    expect(screen.getByText("Skipped: no pattern matches")).toBeTruthy();
  });

  it("explains a pattern that cannot be used", async () => {
    const { user } = renderFields({
      kind: "trigger.source_upload",
      pathSyntax: "regex",
      pathPatterns: ["^docs/"],
    });

    const pattern = screen.getByRole("textbox", { name: "Pattern 1" });
    await user.clear(pattern);
    await user.type(pattern, "(unclosed");
    expect(screen.getByText("This is not a valid pattern.")).toBeTruthy();
    expect(pattern.getAttribute("aria-invalid")).toBe("true");
  });

  it("removes the last pattern and goes back to every file", async () => {
    const { onChange, user } = renderFields({
      kind: "trigger.source_upload",
      pathPatterns: ["*.json"],
    });

    await user.click(screen.getByRole("button", { name: "Remove pattern 1" }));
    expect(onChange).toHaveBeenLastCalledWith({
      kind: "trigger.source_upload",
      pathPatterns: undefined,
    });
  });

  it("runs on new files only when chosen", async () => {
    const { onChange, user } = renderFields();

    await user.click(screen.getByRole("tab", { name: "New files only" }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: "trigger.source_upload", uploads: "new" });
  });
});
