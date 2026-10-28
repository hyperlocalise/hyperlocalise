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
import { describe, expect, it } from "vite-plus/test";

import {
  buildCustomerIoDesignStudioTranslationContent,
  buildCustomerIoResourceSourcePath,
  isCustomerIoDesignStudioManagedError,
  isCustomerIoPushSkippedError,
} from "./push-customer-io-campaigns";
import { CustomerIoApiError } from "./client";

describe("buildCustomerIoResourceSourcePath", () => {
  it("builds html paths for email and in_app actions to match the importer", () => {
    expect(
      buildCustomerIoResourceSourcePath({ kind: "campaign", id: "7", name: "x" }, "42", "email"),
    ).toBe("customer-io/campaigns/7/actions/42.html");
    expect(
      buildCustomerIoResourceSourcePath({ kind: "broadcast", id: "2", name: "x" }, "96", "Email"),
    ).toBe("customer-io/broadcasts/2/actions/96.html");
    expect(
      buildCustomerIoResourceSourcePath({ kind: "broadcast", id: "2", name: "x" }, "15", "in_app"),
    ).toBe("customer-io/broadcasts/2/actions/15.html");
    expect(
      buildCustomerIoResourceSourcePath(
        { kind: "newsletter", id: "10", name: "x" },
        "101",
        "email",
      ),
    ).toBe("customer-io/newsletters/10/contents/101.html");
    expect(
      buildCustomerIoResourceSourcePath(
        { kind: "transactional", id: "5", name: "x" },
        "201",
        "email",
      ),
    ).toBe("customer-io/transactional/5/contents/201.html");
  });

  it("builds json paths for non-email actions", () => {
    expect(
      buildCustomerIoResourceSourcePath({ kind: "campaign", id: "7", name: "x" }, "42", "push"),
    ).toBe("customer-io/campaigns/7/actions/42.json");
    expect(buildCustomerIoResourceSourcePath({ kind: "campaign", id: "7", name: "x" }, "42")).toBe(
      "customer-io/campaigns/7/actions/42.json",
    );
  });
});

describe("isCustomerIoPushSkippedError", () => {
  it("skips missing variants and rejected language tags", () => {
    expect(
      isCustomerIoPushSkippedError(
        new CustomerIoApiError("customer_io_translation_missing", "m", 404),
      ),
    ).toBe(true);
    expect(
      isCustomerIoPushSkippedError(new CustomerIoApiError("customer_io_request_failed", "m", 400)),
    ).toBe(true);
  });

  it("fails on other errors", () => {
    expect(
      isCustomerIoPushSkippedError(new CustomerIoApiError("customer_io_request_failed", "m", 500)),
    ).toBe(false);
    expect(isCustomerIoPushSkippedError(new Error("boom"))).toBe(false);
  });
});

describe("isCustomerIoDesignStudioManagedError", () => {
  it("detects the Design Studio guard on App API writes", () => {
    expect(
      isCustomerIoDesignStudioManagedError(
        new CustomerIoApiError(
          "customer_io_request_failed",
          "Customer.io request to /campaigns/1/actions/2/language/zh-CN failed with status 400. Reason: Cannot update content managed by Design Studio. Please use the Design Studio API.",
          400,
        ),
      ),
    ).toBe(true);
  });

  it("ignores other failures", () => {
    expect(
      isCustomerIoDesignStudioManagedError(
        new CustomerIoApiError("customer_io_request_failed", "failed with status 400", 400),
      ),
    ).toBe(false);
    expect(isCustomerIoDesignStudioManagedError(new Error("boom"))).toBe(false);
  });
});

describe("buildCustomerIoDesignStudioTranslationContent", () => {
  it("maps the merged map onto Design Studio content fields", () => {
    expect(
      buildCustomerIoDesignStudioTranslationContent({
        subject: "Sujet",
        preheader_text: "Aperçu",
        body: "<x-base><p>Bonjour</p></x-base>",
      }),
    ).toEqual({
      subject: "Sujet",
      preheader_text: "Aperçu",
      html: "<x-base><p>Bonjour</p></x-base>",
    });
  });

  it("defaults missing fields to empty strings", () => {
    expect(buildCustomerIoDesignStudioTranslationContent({})).toEqual({
      subject: "",
      preheader_text: "",
      html: "",
    });
  });
});
