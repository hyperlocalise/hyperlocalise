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

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import type { QaFindingRow } from "./qa-findings-table";

const { explain } = vi.hoisted(() => ({
  explain: vi.fn(),
}));

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    loading: false,
    client: {
      qaReport: {
        findings: {
          explain,
          review: vi.fn(),
          reviewMany: vi.fn(),
        },
        project: { promoteFindings: vi.fn() },
      },
    },
  }),
}));

import { QaFindingsTable, QaText } from "./qa-findings-table";

describe("QaText", () => {
  it("marks non-breaking spaces so the difference is visible", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <QaText text={"$2,000\u00a0per"} tokens={[]} visibleWhitespace />
      </IntlProvider>,
    );

    expect(screen.getByTitle("Non-breaking space")).toHaveTextContent("·");
  });

  it("highlights non-breaking spaces without turning on space marks", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <QaText text={"a b\u00a0c"} tokens={[]} visibleWhitespace={false} />
      </IntlProvider>,
    );

    expect(screen.getByTitle("Non-breaking space").textContent).toBe("\u00a0");
    expect(screen.queryByText("·")).not.toBeInTheDocument();
  });

  it("renders ordinary visible whitespace in runs", () => {
    const { container } = render(
      <IntlProvider locale="en" messages={{}}>
        <QaText text={"a   b\t\tc"} tokens={[]} visibleWhitespace />
      </IntlProvider>,
    );

    const marks = [...container.querySelectorAll("span")].filter((element) =>
      /^[·⇥]+$/.test(element.textContent ?? ""),
    );
    expect(marks.map((element) => element.textContent)).toEqual(["···", "⇥⇥"]);
  });
});

function finding(overrides: Partial<QaFindingRow> = {}): QaFindingRow {
  return {
    id: "finding-1",
    runId: "run-1",
    projectId: "project-1",
    key: "greeting",
    sourcePath: null,
    targetLocale: "fr-FR",
    checkType: "guideline",
    severity: "warning",
    category: "qa",
    message: "This text may not match a project guideline.",
    relatedTokens: [],
    sourceText: "Hello",
    targetText: "Bonjour",
    editorHref: "/editor",
    status: "open",
    passageId: "passage-1",
    reasoningAvailable: true,
    ...overrides,
  };
}

describe("QaFindingsTable guideline explain", () => {
  it("explains only an unexplained guideline finding", async () => {
    explain.mockReset();
    let resolveExplain: (value: unknown) => void = () => {};
    explain.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveExplain = resolve;
        }),
    );
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <IntlProvider locale="en" messages={{}}>
          <QaFindingsTable
            organizationSlug="acme"
            findings={[
              finding(),
              finding({
                id: "finding-explained",
                key: "already",
                reasoningAvailable: false,
              }),
              finding({
                id: "finding-spelling",
                key: "spelling",
                checkType: "spelling",
                passageId: null,
                reasoningAvailable: false,
              }),
            ]}
            total={3}
            shownCount={3}
            canPromote={false}
            promoteScope="project"
            projectId="project-1"
          />
        </IntlProvider>
      </QueryClientProvider>,
    );

    const button = screen.getByRole("button", { name: "Explain" });
    await user.click(button);
    expect(explain).toHaveBeenCalledTimes(1);
    expect(explain).toHaveBeenCalledWith("acme", "finding-1");
    expect(screen.getByRole("button", { name: "Explaining…" })).toBeDisabled();
    resolveExplain({ finding: { id: "finding-1" } });
  });
});
