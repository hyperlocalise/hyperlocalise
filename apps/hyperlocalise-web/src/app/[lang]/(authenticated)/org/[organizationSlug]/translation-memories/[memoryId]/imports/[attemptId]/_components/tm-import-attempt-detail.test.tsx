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

import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IntlProvider } from "react-intl";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  memoryInterchangeCountItems,
  memoryInterchangeReportSamples,
  TmImportAttemptDetail,
  TmImportDiagnosticList,
  TmInterchangeFailureDetails,
} from "./tm-import-attempt-detail";

const { getAttemptMock, queueImportMock, memoryGetMock } = vi.hoisted(() => ({
  getAttemptMock: vi.fn(),
  queueImportMock: vi.fn(async () => ({ attemptId: "attempt-1", status: "queued" })),
  memoryGetMock: vi.fn(
    async (): Promise<{
      ok: boolean;
      json?: () => Promise<{ memory: { name: string; status: string } }>;
    }> => ({
      ok: true as const,
      json: async () => ({ memory: { name: "Product TM", status: "active" } }),
    }),
  ),
}));

vi.mock("@/lib/go-svc/use-go-svc-client", () => ({
  useGoSvcClient: () => ({
    client: {
      memory: {
        importAttempts: { get: getAttemptMock },
        entries: { queueImport: queueImportMock },
      },
    },
    loading: false,
  }),
}));

vi.mock("@/lib/api-client-instance", () => ({
  apiClient: {
    api: {
      orgs: {
        ":organizationSlug": {
          "translation-memories": {
            ":memoryId": {
              $get: () => memoryGetMock(),
            },
          },
        },
      },
    },
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/en/org/acme/translation-memories/memory-1/imports/attempt-1",
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function importAttemptResponse(status: string, createdByUserId: string | null = "user-1") {
  return {
    memoryImportAttempt: {
      id: "attempt-1",
      organizationId: "org-1",
      memoryId: "memory-1",
      createdByUserId,
      actorDisplayName: "Ada",
      operation: "import",
      status,
      importBatchId: "attempt-1",
      mode: "apply",
      format: "tmx",
      options: {},
      sourceFilename: "memory.tmx",
      sourceByteSize: 42,
      sourceSha256: "abc",
      counts: {
        totalRead: 3,
        created: 0,
        updated: 0,
        variantCreated: 0,
        skipped: 0,
        warned: 0,
        failed: 0,
      },
      headerSrclang: "en",
      diagnosticsTruncated: false,
      diagnosticsAvailability: "available",
      diagnosticsExpiresAt: null,
      retentionPolicy: "indefinite",
      failureCode: null,
      resultFilename: null,
      resultReady: false,
      createdAt: "2026-10-06T00:00:00.000000Z",
      completedAt: null,
    },
    diagnostics: [],
  };
}

function renderDetail(props?: { currentUserId?: string; canWriteMemories?: boolean }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <IntlProvider locale="en">
      <QueryClientProvider client={queryClient}>
        <TmImportAttemptDetail
          organizationSlug="acme"
          memoryId="memory-1"
          attemptId="attempt-1"
          currentUserId={props?.currentUserId ?? "user-1"}
          canWriteMemories={props?.canWriteMemories ?? true}
        />
      </QueryClientProvider>
    </IntlProvider>,
  );
}

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

describe("memoryInterchangeReportSamples", () => {
  it("returns well-formed samples and skips malformed entries", () => {
    const samples = memoryInterchangeReportSamples({
      counts: {
        samples: [
          { sourceLocale: "en", targetLocale: "ms", sourceText: "Hello", targetText: "Helo" },
          { sourceText: "Missing target" },
          "not-an-object",
          { sourceText: "Second", targetText: "Kedua" },
        ],
      },
    });
    expect(samples).toEqual([
      { sourceLocale: "en", targetLocale: "ms", sourceText: "Hello", targetText: "Helo" },
      { sourceLocale: "", targetLocale: "", sourceText: "Second", targetText: "Kedua" },
    ]);
  });

  it("caps samples at five entries", () => {
    const makeSample = (index: number) => ({ sourceText: `s${index}`, targetText: `t${index}` });
    const samples = memoryInterchangeReportSamples({
      counts: { samples: Array.from({ length: 8 }, (_, index) => makeSample(index)) },
    });
    expect(samples).toHaveLength(5);
    expect(samples[0]).toEqual({
      sourceLocale: "",
      targetLocale: "",
      sourceText: "s0",
      targetText: "t0",
    });
  });

  it("returns an empty list when counts carry no samples", () => {
    expect(memoryInterchangeReportSamples({ counts: null })).toEqual([]);
    expect(memoryInterchangeReportSamples({ counts: {} })).toEqual([]);
  });
});

describe("TmImportAttemptDetail import actions", () => {
  it("does not offer Import entries while preview is running", async () => {
    getAttemptMock.mockResolvedValue(importAttemptResponse("running"));
    renderDetail();

    await screen.findByText("memory.tmx");

    expect(screen.queryByRole("button", { name: "Import entries" })).not.toBeInTheDocument();
    expect(queueImportMock).not.toHaveBeenCalled();
  });

  it("shows Import entries when preview completes", async () => {
    getAttemptMock.mockResolvedValue(importAttemptResponse("preview_completed"));
    renderDetail();

    expect(await screen.findByRole("button", { name: "Import entries" })).toBeInTheDocument();
  });

  it("shows View affected entries when the import completes", async () => {
    getAttemptMock.mockResolvedValue(importAttemptResponse("completed"));
    renderDetail();

    expect(await screen.findByRole("link", { name: "View affected entries" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Import entries" })).not.toBeInTheDocument();
  });
});

describe("TmImportAttemptDetail report samples", () => {
  it("shows sample rows after the import completes", async () => {
    const response = importAttemptResponse("completed");
    (response.memoryImportAttempt.counts as Record<string, unknown>).samples = [
      { sourceLocale: "en", targetLocale: "ms", sourceText: "Hello", targetText: "Helo" },
      {
        sourceLocale: "en",
        targetLocale: "ms",
        sourceText: "Goodbye",
        targetText: "Selamat tinggal",
      },
    ];
    getAttemptMock.mockResolvedValue(response);
    renderDetail();

    expect(await screen.findByText("Sample entries")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
    expect(screen.getByText("Selamat tinggal")).toBeInTheDocument();
  });

  it("omits sample rows when the report has no samples", async () => {
    getAttemptMock.mockResolvedValue(importAttemptResponse("completed"));
    renderDetail();

    await screen.findByText("View affected entries");

    expect(screen.queryByText("Sample entries")).not.toBeInTheDocument();
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
