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
  defaultRepositorySourceFileSegmentationSettings,
  normalizeSegmentationSettings,
  repositorySourceFileSegmentationSettingsSchema,
  resolveSandboxSrxCliSpec,
} from "./source-file-segmentation-schema";
import { SRX_CUSTOM_SANDBOX_FILENAME } from "@/lib/i18n/srx/srx-template-samples";

describe("repositorySourceFileSegmentationSettingsSchema", () => {
  it("accepts disabled settings without validating custom XML", () => {
    const parsed = repositorySourceFileSegmentationSettingsSchema.parse({
      enabled: false,
      template: "custom",
      customSrxXml: "not-xml",
    });
    expect(parsed).toEqual({
      enabled: false,
      template: "custom",
      customSrxXml: "not-xml",
    });
  });

  it("rejects enabled custom templates that are not XML", () => {
    const result = repositorySourceFileSegmentationSettingsSchema.safeParse({
      enabled: true,
      template: "custom",
      customSrxXml: "plain rules",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(["customSrxXml"]);
      expect(result.error.issues[0]?.message).toMatch(/XML/i);
    }
  });

  it("accepts enabled custom templates that start with XML", () => {
    const parsed = repositorySourceFileSegmentationSettingsSchema.parse({
      enabled: true,
      template: "custom",
      customSrxXml: '  <srx version="2.0"/>  ',
    });
    expect(parsed.customSrxXml).toBe('  <srx version="2.0"/>  ');
  });

  it("accepts enabled builtin templates", () => {
    expect(
      repositorySourceFileSegmentationSettingsSchema.parse({
        enabled: true,
        template: "markdown",
      }),
    ).toMatchObject({ enabled: true, template: "markdown" });
  });
});

describe("normalizeSegmentationSettings", () => {
  it("returns defaults for nullish input", () => {
    expect(normalizeSegmentationSettings(null)).toEqual(
      defaultRepositorySourceFileSegmentationSettings(),
    );
    expect(normalizeSegmentationSettings(undefined)).toEqual(
      defaultRepositorySourceFileSegmentationSettings(),
    );
  });

  it("preserves builtin and custom templates and coerces unknown templates to default", () => {
    expect(
      normalizeSegmentationSettings({
        enabled: true,
        template: "html",
        customSrxXml: null,
      }),
    ).toEqual({ enabled: true, template: "html", customSrxXml: null });

    expect(
      normalizeSegmentationSettings({
        enabled: true,
        template: "custom",
        customSrxXml: "<srx/>",
      }),
    ).toEqual({ enabled: true, template: "custom", customSrxXml: "<srx/>" });

    expect(
      normalizeSegmentationSettings({
        enabled: true,
        // Corrupt / legacy JSON column value
        template: "legacy" as "default",
        customSrxXml: null,
      }),
    ).toEqual({ enabled: true, template: "default", customSrxXml: null });
  });
});

describe("resolveSandboxSrxCliSpec", () => {
  it("returns no CLI flags when segmentation is disabled", () => {
    expect(
      resolveSandboxSrxCliSpec({
        enabled: false,
        template: "html",
        customSrxXml: "<srx/>",
      }),
    ).toEqual({});
  });

  it("maps builtin templates to the SRX flag", () => {
    expect(
      resolveSandboxSrxCliSpec({
        enabled: true,
        template: "markdown",
        customSrxXml: null,
      }),
    ).toEqual({ srxFlag: "markdown" });
  });

  it("returns empty when custom template has blank XML", () => {
    expect(
      resolveSandboxSrxCliSpec({
        enabled: true,
        template: "custom",
        customSrxXml: "   ",
      }),
    ).toEqual({});
  });

  it("stages custom SRX XML under the sandbox filename", () => {
    const xml = '<srx version="2.0"/>';
    expect(
      resolveSandboxSrxCliSpec({
        enabled: true,
        template: "custom",
        customSrxXml: `  ${xml}  `,
      }),
    ).toEqual({
      srxFlag: SRX_CUSTOM_SANDBOX_FILENAME,
      customSandboxPath: SRX_CUSTOM_SANDBOX_FILENAME,
      customSandboxContent: xml,
    });
  });
});
