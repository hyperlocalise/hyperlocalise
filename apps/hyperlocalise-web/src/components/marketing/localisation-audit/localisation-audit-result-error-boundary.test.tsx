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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import { LocalisationAuditResultErrorBoundary } from "./localisation-audit-result-error-boundary";

function ThrowingSection({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Broken audit section");
  }
  return <p>Section recovered</p>;
}

function Probe({ shouldThrow }: { shouldThrow: boolean }) {
  return (
    <div>
      <p>Surrounding report chrome</p>
      <LocalisationAuditResultErrorBoundary scope="section" section="cta">
        <ThrowingSection shouldThrow={shouldThrow} />
      </LocalisationAuditResultErrorBoundary>
    </div>
  );
}

function RetryProbe() {
  const [shouldThrow, setShouldThrow] = useState(true);

  return (
    <div>
      <p>Surrounding report chrome</p>
      <LocalisationAuditResultErrorBoundary scope="section" section="cta">
        <ThrowingSection shouldThrow={shouldThrow} />
      </LocalisationAuditResultErrorBoundary>
      <button type="button" onClick={() => setShouldThrow(false)}>
        Recover section
      </button>
    </div>
  );
}

describe("LocalisationAuditResultErrorBoundary", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("contains a section render failure and keeps surrounding report chrome", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <IntlProvider locale="en" messages={{}}>
        <Probe shouldThrow />
      </IntlProvider>,
    );

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(document.querySelector("[data-localisation-audit-error='section']")).toBeTruthy();
    expect(screen.getByText("This section could not be shown")).toBeTruthy();
    expect(screen.getByText("Surrounding report chrome")).toBeTruthy();
  });

  it("retries the section without replacing surrounding content", async () => {
    const user = userEvent.setup();
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    render(
      <IntlProvider locale="en" messages={{}}>
        <RetryProbe />
      </IntlProvider>,
    );

    expect(screen.getByText("This section could not be shown")).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Recover section" }));
    await user.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Section recovered")).toBeTruthy();
    expect(screen.getByText("Surrounding report chrome")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
