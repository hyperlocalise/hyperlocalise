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
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import {
  memoryInterchangeCountItems,
  TmImportDiagnosticList,
  TmInterchangeFailureDetails,
} from "./tm-import-attempt-detail";

describe("TmImportDiagnosticList", () => {
  it("renders a zero-based diagnostic unit index", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <TmImportDiagnosticList
          diagnostics={[
            {
              severity: "warning",
              code: "invalid_unit",
              message: "The first unit needs attention.",
              unitIndex: 0,
            },
          ]}
        />
      </IntlProvider>,
    );

    expect(screen.getByText("Unit 0")).toBeInTheDocument();
    expect(screen.getByText("The first unit needs attention.")).toBeInTheDocument();
  });
});

describe("memoryInterchangeCountItems", () => {
  it("shows the exported entry count for an export", () => {
    const items = memoryInterchangeCountItems({
      operation: "export",
      counts: { entries: 12 },
    });

    expect(items).toEqual([{ label: expect.objectContaining({ id: "Uc7/iaCod8" }), value: 12 }]);
  });

  it("keeps import metrics for an import", () => {
    const items = memoryInterchangeCountItems({
      operation: "import",
      counts: {
        totalRead: 3,
        created: 2,
        updated: 1,
        variantCreated: 4,
        skipped: 0,
        warned: 1,
        failed: 0,
      },
    });

    expect(items.map((item) => item.value)).toEqual([3, 2, 1, 4, 0, 1, 0]);
  });

  it("does not invent import zeros when an export has no entry count yet", () => {
    expect(memoryInterchangeCountItems({ operation: "export", counts: null })).toEqual([]);
  });
});

describe("TmInterchangeFailureDetails", () => {
  it("shows the recorded reason when an export fails", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <TmInterchangeFailureDetails
          failureCode="export_failed"
          failureMessage="The export file could not be written."
        />
      </IntlProvider>,
    );

    expect(screen.getByText("export_failed")).toBeInTheDocument();
    expect(screen.getByText("Failure reason")).toBeInTheDocument();
    expect(screen.getByText("The export file could not be written.")).toBeInTheDocument();
  });

  it("hides a blank failure reason", () => {
    render(
      <IntlProvider locale="en" messages={{}}>
        <TmInterchangeFailureDetails failureCode={null} failureMessage="   " />
      </IntlProvider>,
    );

    expect(screen.queryByText("Failure reason")).not.toBeInTheDocument();
  });
});
