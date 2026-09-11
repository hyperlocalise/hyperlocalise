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
import type { ComponentProps } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { ProjectLocaleProgressList } from "./project-locale-progress-list";

function renderList(props: ComponentProps<typeof ProjectLocaleProgressList>) {
  return render(
    <IntlProvider locale="en" messages={{}} onError={() => undefined}>
      <ProjectLocaleProgressList {...props} />
    </IntlProvider>,
  );
}

describe("ProjectLocaleProgressList", () => {
  it("renders one skeleton row per expected locale while loading", () => {
    const { container } = renderList({
      locales: [],
      expectedLocaleCount: 3,
      isLoading: true,
      settingsHref: "/org/acme/projects/p1/settings",
    });

    expect(screen.getByText("3")).toBeInTheDocument();
    expect(container.querySelectorAll('[data-slot="skeleton"]')).toHaveLength(3);
  });
});
