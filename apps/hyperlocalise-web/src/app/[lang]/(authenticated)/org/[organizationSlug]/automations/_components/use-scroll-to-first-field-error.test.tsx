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
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { useScrollToFirstFieldError } from "./use-scroll-to-first-field-error";

const scrollIntoView = vi.fn();

function Harness({
  errors,
  initialTab = "settings",
}: {
  errors: Record<string, string | undefined>;
  initialTab?: string;
}) {
  const [tab, setTab] = useState(initialTab);
  const ref = useScrollToFirstFieldError(errors, tab, setTab);

  return (
    <div ref={ref}>
      <output aria-label="Tab">{tab}</output>
      {tab === "settings" ? (
        <>
          <p data-slot="field-error">First problem</p>
          <p data-slot="field-error">Second problem</p>
        </>
      ) : null}
    </div>
  );
}

describe("useScrollToFirstFieldError", () => {
  beforeEach(() => {
    scrollIntoView.mockReset();
    window.matchMedia = vi.fn().mockReturnValue({ matches: false }) as typeof window.matchMedia;
    Element.prototype.scrollIntoView = function scroll(this: Element, options) {
      scrollIntoView(this.textContent, options);
    };
  });

  it("scrolls to the first field with an error", () => {
    render(<Harness errors={{ name: "Name is required." }} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith("First problem", {
      behavior: "smooth",
      block: "center",
    });
  });

  it("does not scroll when there are no errors", () => {
    render(<Harness errors={{}} />);

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls once per save, and again when a later save finds errors again", () => {
    const first = { name: "Name is required." };
    const { rerender } = render(<Harness errors={first} />);
    rerender(<Harness errors={first} />);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    rerender(<Harness errors={{ name: "Name is required." }} />);
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
  });

  it("returns to the settings tab before scrolling", () => {
    render(<Harness errors={{ name: "Name is required." }} initialTab="history" />);

    expect(screen.getByLabelText("Tab")).toHaveTextContent("settings");
    expect(scrollIntoView).toHaveBeenCalledWith("First problem", expect.anything());
  });
});
