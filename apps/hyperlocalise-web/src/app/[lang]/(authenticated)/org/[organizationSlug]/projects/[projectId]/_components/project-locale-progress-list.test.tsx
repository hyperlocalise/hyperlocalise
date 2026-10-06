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

import type { ProjectLocaleProgressRow } from "@/api/routes/project/project.schema";

import { ProjectLocaleProgressList } from "./project-locale-progress-list";

function localeRow(locale: string): ProjectLocaleProgressRow {
  return {
    locale,
    translationProgress: 10,
    approvalProgress: 0,
    words: { total: 10, translated: 1, approved: 0 },
    phrases: { total: 4, translated: 1, approved: 0 },
    lastActivityAt: null,
  };
}

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

  it("shows a country flag when the locale has one and the language code otherwise", () => {
    renderList({
      locales: [localeRow("fr-FR"), localeRow("es-419")],
      settingsHref: "/org/acme/projects/p1/settings",
    });

    expect(screen.getByText("🇫🇷")).toBeInTheDocument();
    expect(screen.getByText("ES")).toBeInTheDocument();
    expect(screen.queryByText("FR")).not.toBeInTheDocument();
  });
});
