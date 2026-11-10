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
import { createIntl } from "react-intl";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";

import {
  buildTranslationAsSourceSentDecoration,
  fetchTranslationAsSourceReceipts,
  fetchTranslationAsSourceSends,
  type TranslationAsSourceReceipt,
  type TranslationAsSourceSend,
} from "./translation-as-source-sent-mark";

const intl = createIntl({ locale: "en", onError: () => undefined });

function send(overrides: Partial<TranslationAsSourceSend> = {}): TranslationAsSourceSend {
  return {
    sourcePath: "requests/report.docx",
    destinationProjectId: "project_en",
    destinationProjectName: "Requests (English)",
    locale: "en",
    sentAt: "2026-11-10T13:56:58.674Z",
    changedSinceSent: false,
    replacedInDestination: false,
    ...overrides,
  };
}

function receipt(overrides: Partial<TranslationAsSourceReceipt> = {}): TranslationAsSourceReceipt {
  return {
    sourcePath: "requests/report.docx",
    fromProjectName: "Requests (Chinese)",
    locale: "en",
    receivedAt: "2026-11-11T02:15:00.000Z",
    replaced: null,
    ...overrides,
  };
}

function sentDate(value: string) {
  return intl.formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

describe("translation as source sent mark", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("marks a sent file and names the project and time in the tooltip", () => {
    expect(
      buildTranslationAsSourceSentDecoration(
        [send()],
        { jobStatus: null, metadata: "12 KB" },
        intl,
      ),
    ).toEqual({
      text: "Sent",
      title: `12 KB\nSent to Requests (English) on ${sentDate("2026-11-10T13:56:58.674Z")}.`,
      parts: [{ text: "Sent" }],
    });
  });

  it("keeps the file's latest job status before the mark", () => {
    expect(
      buildTranslationAsSourceSentDecoration(
        [send()],
        { jobStatus: "failed", metadata: "12 KB" },
        intl,
      ),
    ).toMatchObject({ text: "failed · Sent", parts: [{ text: "failed · " }, { text: "Sent" }] });
  });

  it("marks a file changed since any of its sends, and says which project to send it to", () => {
    const decoration = buildTranslationAsSourceSentDecoration(
      [
        send(),
        send({
          destinationProjectId: "project_en_gb",
          destinationProjectName: "Requests (UK)",
          changedSinceSent: true,
        }),
      ],
      { jobStatus: null, metadata: "12 KB" },
      intl,
    );

    expect(decoration).toEqual({
      text: "Changed since sent",
      title: [
        "12 KB",
        `Sent to Requests (English) on ${sentDate("2026-11-10T13:56:58.674Z")}.`,
        `Sent to Requests (UK) on ${sentDate("2026-11-10T13:56:58.674Z")}. The English translation has changed since, or the file was uploaded again. Sending it again updates Requests (UK).`,
      ].join("\n"),
      parts: [{ text: "Changed since sent", color: "var(--ds-amber-900)" }],
    });
  });

  it("marks a file sent here and names the project it came from", () => {
    expect(
      buildTranslationAsSourceSentDecoration(
        [],
        { jobStatus: null, metadata: "12 KB" },
        intl,
        receipt(),
      ),
    ).toEqual({
      text: "From Requests (Chinese)",
      title: `12 KB\nSent here from Requests (Chinese) on ${sentDate("2026-11-11T02:15:00.000Z")}.`,
      parts: [{ text: "From Requests (Chinese)" }],
    });
  });

  it("shows where a file came from, then where it was sent, after its job status", () => {
    const decoration = buildTranslationAsSourceSentDecoration(
      [send({ changedSinceSent: true })],
      { jobStatus: "failed", metadata: "12 KB" },
      intl,
      receipt({ fromProjectName: "Customer support articles (Simplified Chinese)" }),
    );

    expect(decoration).toMatchObject({
      text: "failed · From Customer support articl… · Changed since sent",
      parts: [
        { text: "failed · " },
        { text: "From Customer support articl… · " },
        { text: "Changed since sent", color: "var(--ds-amber-900)" },
      ],
    });
    expect(decoration.title?.split("\n")[1]).toBe(
      `Sent here from Customer support articles (Simplified Chinese) on ${sentDate("2026-11-11T02:15:00.000Z")}.`,
    );
  });

  it("does not name a project the person cannot open", () => {
    expect(
      buildTranslationAsSourceSentDecoration(
        [],
        { jobStatus: null, metadata: "" },
        intl,
        receipt({ fromProjectName: null }),
      ),
    ).toEqual({
      text: "From another project",
      title: `Sent here from another project on ${sentDate("2026-11-11T02:15:00.000Z")}.`,
      parts: [{ text: "From another project" }],
    });
  });

  it("marks a file whose copy in the other project was replaced since", () => {
    expect(
      buildTranslationAsSourceSentDecoration(
        [send({ replacedInDestination: true, changedSinceSent: true })],
        { jobStatus: null, metadata: "" },
        intl,
      ),
    ).toEqual({
      text: "Replaced in Requests (English)",
      title: `Sent to Requests (English) on ${sentDate("2026-11-10T13:56:58.674Z")}. A file added there since replaced it; Use translation as source… shows what it is.`,
      parts: [{ text: "Replaced in Requests (English)", color: "var(--ds-amber-900)" }],
    });
  });

  it("says what a send here replaced", () => {
    expect(
      buildTranslationAsSourceSentDecoration(
        [],
        { jobStatus: null, metadata: "" },
        intl,
        receipt({ replaced: { addedAt: "2026-11-03T09:30:00.000Z", addedBy: "Mei Chen" } }),
      ),
    ).toMatchObject({
      title: `Sent here from Requests (Chinese) on ${sentDate("2026-11-11T02:15:00.000Z")}. It replaced the version Mei Chen uploaded on ${sentDate("2026-11-03T09:30:00.000Z")}.`,
    });
  });

  it("reads the files sent here by path", async () => {
    const received = [receipt(), receipt({ sourcePath: "prices.xlsx", fromProjectName: null })];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ received })),
    );

    const receipts = await fetchTranslationAsSourceReceipts("acme", "project_en");

    expect(receipts.get("requests/report.docx")).toEqual(received[0]);
    expect(receipts.get("prices.xlsx")).toEqual(received[1]);
  });

  it("groups each file's sends by path", async () => {
    const sends = [
      send(),
      send({ destinationProjectId: "project_en_gb" }),
      send({ sourcePath: "prices.xlsx" }),
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ sends })),
    );

    const sendsByPath = await fetchTranslationAsSourceSends("acme", "project_zh");

    expect(sendsByPath.get("requests/report.docx")).toEqual([sends[0], sends[1]]);
    expect(sendsByPath.get("prices.xlsx")).toEqual([sends[2]]);
  });
});
