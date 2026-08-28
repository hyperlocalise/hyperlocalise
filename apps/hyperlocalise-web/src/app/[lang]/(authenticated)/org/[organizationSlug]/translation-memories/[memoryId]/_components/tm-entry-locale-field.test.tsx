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

import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import { TmEntryLocaleField } from "./tm-entry-locale-field";

function Harness({
  onValueChange = vi.fn(),
  initialValue = "en-US",
}: {
  onValueChange?: (locale: string) => void;
  initialValue?: string;
}) {
  const [value, setValue] = useState(initialValue);
  return (
    <IntlProvider locale="en" messages={{}}>
      <TmEntryLocaleField
        label="Source locale"
        value={value}
        locales={["en-US", "fr-FR"]}
        onValueChange={(locale) => {
          setValue(locale);
          onValueChange(locale);
        }}
      />
    </IntlProvider>
  );
}

describe("TmEntryLocaleField", () => {
  it("applies a valid custom BCP-47 locale outside the curated list", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole("button", { name: "Use a custom locale" }));
    await user.type(screen.getByLabelText("e.g. sw-KE"), "sw-ke");
    await user.click(screen.getByRole("button", { name: "Use locale" }));

    expect(onValueChange).toHaveBeenCalledWith("sw-KE");
    expect(screen.getByRole("combobox", { name: "Source locale" })).toHaveTextContent("sw-KE");
  });

  it("rejects an invalid custom locale", async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(<Harness onValueChange={onValueChange} />);

    await user.click(screen.getByRole("button", { name: "Use a custom locale" }));
    await user.type(screen.getByLabelText("e.g. sw-KE"), "not-a-locale!!!");
    await user.click(screen.getByRole("button", { name: "Use locale" }));

    expect(onValueChange).not.toHaveBeenCalled();
    expect(
      screen.getByText("Enter a valid BCP-47 locale (e.g. fr-FR, zh-Hant-TW)."),
    ).toBeInTheDocument();
  });
});
