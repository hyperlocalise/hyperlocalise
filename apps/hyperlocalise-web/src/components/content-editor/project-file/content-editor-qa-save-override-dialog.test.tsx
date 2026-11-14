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

import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

import { useContentEditorQaSaveOverride } from "./content-editor-qa-save-override-dialog";

const PLURAL_CHECK: ContentEditorFormatCheck = {
  id: "qa-unreachable-plural-case",
  label: "Plural cases",
  status: "fail",
  message: 'Locale vi never selects plural case "one".',
  category: "qa",
};

function renderHarness() {
  let confirm: ReturnType<typeof useContentEditorQaSaveOverride>["confirmQaSaveOverride"];
  function Harness() {
    const { confirmQaSaveOverride, qaSaveOverrideDialog } = useContentEditorQaSaveOverride();
    confirm = confirmQaSaveOverride;
    return qaSaveOverrideDialog;
  }
  render(
    <IntlProvider locale="en">
      <Harness />
    </IntlProvider>,
  );
  return { confirm: (checks: readonly ContentEditorFormatCheck[]) => confirm(checks) };
}

describe("useContentEditorQaSaveOverride", () => {
  it("resolves true when the translator saves anyway", async () => {
    const user = userEvent.setup();
    const { confirm } = renderHarness();

    let result: Promise<boolean> | undefined;
    act(() => {
      result = confirm([PLURAL_CHECK]);
    });

    expect(await screen.findByText(PLURAL_CHECK.message)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Save anyway" }));

    await expect(result).resolves.toBe(true);
  });

  it("resolves false when the translator keeps editing", async () => {
    const user = userEvent.setup();
    const { confirm } = renderHarness();

    let result: Promise<boolean> | undefined;
    act(() => {
      result = confirm([PLURAL_CHECK]);
    });

    await user.click(await screen.findByRole("button", { name: "Keep editing" }));

    await expect(result).resolves.toBe(false);
  });
});
