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

import { ProjectFileSourceStringsPreview } from "./project-file-source-strings-preview";
import { SourceFileIngestStatus } from "./source-file-ingest-status";

function renderWithIntl(ui: React.ReactElement) {
  return render(<IntlProvider locale="en">{ui}</IntlProvider>);
}

describe("SourceFileIngestStatus", () => {
  it("shows extracting copy while ingest is pending", () => {
    renderWithIntl(<SourceFileIngestStatus ingestState="pending" />);
    expect(screen.getByText("Extracting segments…")).toBeInTheDocument();
  });

  it("shows the stored ingest error when extraction failed", () => {
    renderWithIntl(
      <SourceFileIngestStatus ingestState="failed" ingestError="sandbox install failed" />,
    );
    expect(
      screen.getByText("Segment extraction failed: sandbox install failed"),
    ).toBeInTheDocument();
  });

  it("hides after a successful ingest", () => {
    const { container } = renderWithIntl(<SourceFileIngestStatus ingestState="ingested" />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("ProjectFileSourceStringsPreview", () => {
  it("surfaces pending ingest when there are no extracted strings", () => {
    renderWithIntl(
      <ProjectFileSourceStringsPreview
        sourceStrings={{ truncated: false, entries: [] }}
        ingestState="ingesting"
      />,
    );
    expect(screen.getByText("Extracting segments…")).toBeInTheDocument();
  });
});
