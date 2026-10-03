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

import type { ContentEditorFormatCheck } from "@/components/content-editor/shared/types";

import {
  applyEditorQaPolicy,
  applyQaPolicy,
  DEFAULT_QA_POLICY,
  type QaCheckPolicy,
} from "./qa-policy";
import type { TranslationQaCheck } from "./types";

const scanCheck = (
  checkType: TranslationQaCheck["checkType"],
  overrides: Partial<TranslationQaCheck> = {},
): TranslationQaCheck => ({
  checkType,
  severity: "error",
  category: "qa",
  message: `${checkType} failed`,
  relatedTokens: [],
  ...overrides,
});

const editorCheck = (
  overrides: Partial<ContentEditorFormatCheck> & Pick<ContentEditorFormatCheck, "id" | "label">,
): ContentEditorFormatCheck => ({
  status: "fail",
  message: "issue",
  ...overrides,
});

describe("applyQaPolicy", () => {
  it("drops disabled checks and remaps severity from the policy", () => {
    const policy: QaCheckPolicy = {
      ...DEFAULT_QA_POLICY,
      not_localized: { enabled: true, severity: "warning" },
      same_as_source: { enabled: false, severity: "warning" },
    };

    expect(
      applyQaPolicy(
        [
          scanCheck("not_localized", { severity: "error" }),
          scanCheck("same_as_source", { severity: "warning" }),
        ],
        policy,
      ),
    ).toEqual([
      expect.objectContaining({
        checkType: "not_localized",
        severity: "warning",
      }),
    ]);
  });

  it("keeps every default-enabled check when the default policy is used", () => {
    const checks = [scanCheck("length"), scanCheck("numbers_mismatch", { severity: "warning" })];

    expect(applyQaPolicy(checks, DEFAULT_QA_POLICY)).toEqual([
      expect.objectContaining({ checkType: "length", severity: "error" }),
    ]);
  });
});

describe("applyEditorQaPolicy", () => {
  it("maps known editor check ids and remaps fail/warn from policy severity", () => {
    const policy: QaCheckPolicy = {
      ...DEFAULT_QA_POLICY,
      not_localized: { enabled: true, severity: "warning" },
      length: { enabled: true, severity: "error" },
    };

    expect(
      applyEditorQaPolicy(
        [
          editorCheck({
            id: "qa-not-localized",
            label: "Translation",
            category: "qa",
            status: "fail",
          }),
          editorCheck({
            id: "length",
            label: "Length",
            category: "length",
            status: "warn",
          }),
        ],
        policy,
      ),
    ).toEqual([
      expect.objectContaining({
        id: "qa-not-localized",
        status: "warn",
      }),
      expect.objectContaining({
        id: "length",
        status: "fail",
      }),
    ]);
  });

  it("falls back to category when the check id is not in the qa-* map", () => {
    const policy: QaCheckPolicy = {
      ...DEFAULT_QA_POLICY,
      spelling: { enabled: true, severity: "error" },
      glossary_violation: { enabled: false, severity: "warning" },
      placeholder_mismatch: { enabled: true, severity: "warning" },
      format: { enabled: false, severity: "error" },
    };

    expect(
      applyEditorQaPolicy(
        [
          editorCheck({
            id: "spelling-drive",
            label: "Spelling",
            category: "spelling",
            status: "warn",
          }),
          editorCheck({
            id: "glossary-missing-save",
            label: "Glossary",
            category: "glossary",
            status: "fail",
          }),
          editorCheck({
            id: "format-missing-token",
            label: "Placeholders",
            category: "placeholder",
            status: "fail",
          }),
          editorCheck({
            id: "format-html-tag-mismatch",
            label: "Format",
            category: "syntax",
            status: "fail",
          }),
        ],
        policy,
      ),
    ).toEqual([
      expect.objectContaining({ id: "spelling-drive", status: "fail" }),
      expect.objectContaining({ id: "format-missing-token", status: "warn" }),
    ]);
  });

  it("keeps pass checks for enabled types and leaves untyped qa rows untouched", () => {
    const policy: QaCheckPolicy = {
      ...DEFAULT_QA_POLICY,
      length: { enabled: true, severity: "error" },
    };

    expect(
      applyEditorQaPolicy(
        [
          editorCheck({
            id: "length",
            label: "Length",
            category: "length",
            status: "pass",
            message: "Within limit",
          }),
          editorCheck({
            id: "custom-qa-row",
            label: "Custom",
            category: "qa",
            status: "fail",
            message: "Unhandled live row",
          }),
        ],
        policy,
      ),
    ).toEqual([
      expect.objectContaining({ id: "length", status: "pass" }),
      expect.objectContaining({ id: "custom-qa-row", status: "fail" }),
    ]);
  });
});
