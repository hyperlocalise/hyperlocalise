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
import { IntlProvider } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import { JobAssigneeOverflowLabel } from "./job-assignee-overflow-label";

function renderLabel(labels: string[]) {
  return render(
    <IntlProvider locale="en" messages={{}}>
      <JobAssigneeOverflowLabel labels={labels} emptyLabel="No assignees" />
    </IntlProvider>,
  );
}

describe("JobAssigneeOverflowLabel", () => {
  it("shows the empty label when nobody is assigned", () => {
    renderLabel([]);
    expect(screen.getByText("No assignees")).toBeInTheDocument();
  });

  it("shows a single assignee name without a remainder", () => {
    renderLabel(["Malena"]);
    expect(screen.getByText("Malena")).toBeInTheDocument();
    expect(screen.queryByText("+1")).not.toBeInTheDocument();
  });

  it("keeps the first name and a remainder count for long assignee lists", () => {
    renderLabel(["Malena", "Freya", "karina", "Giang", "Natalia"]);
    expect(screen.getByText("Malena")).toBeInTheDocument();
    expect(screen.getByText("+4")).toBeInTheDocument();
    expect(screen.queryByText("Natalia")).not.toBeInTheDocument();
    expect(screen.getByTitle("Malena, Freya, karina, Giang, Natalia")).toBeInTheDocument();
  });
});
