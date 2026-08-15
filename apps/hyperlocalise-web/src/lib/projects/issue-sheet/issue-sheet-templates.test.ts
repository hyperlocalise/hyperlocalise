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
import { IntlShape } from "react-intl";
import { createIntl } from "react-intl";
import { describe, expect, it } from "vite-plus/test";

import {
  findIssueSheetTemplate,
  issueSheetTemplateLabel,
  issueSheetTemplateSkeleton,
  issueSheetTemplates,
} from "./issue-sheet-templates";

const intl: IntlShape = createIntl({ locale: "en", messages: {} });

describe("issueSheetTemplates", () => {
  it("has exactly the five templates named in the acceptance criteria, each with a distinct key from its issueType", () => {
    expect(issueSheetTemplates.map((template) => template.key)).toEqual([
      "tpl_translation_mistake",
      "tpl_source_mistake",
      "tpl_context_request",
      "tpl_glossary_violation",
      "tpl_qa_failure",
    ]);
    for (const template of issueSheetTemplates) {
      expect(template.key).not.toBe(template.issueType);
    }
  });

  it("never defaults a template to P0 — P0 stays a deliberate human escalation", () => {
    for (const template of issueSheetTemplates) {
      expect(template.defaultPriority).not.toBe("P0");
    }
  });

  it("keeps context_request at P2, matching CAT's prior hardcoded default exactly", () => {
    const template = findIssueSheetTemplate("tpl_context_request");
    expect(template?.defaultPriority).toBe("P2");
    expect(template?.issueType).toBe("context_request");
  });
});

describe("findIssueSheetTemplate", () => {
  it("returns undefined for null, undefined, and unknown keys", () => {
    expect(findIssueSheetTemplate(null)).toBeUndefined();
    expect(findIssueSheetTemplate(undefined)).toBeUndefined();
    expect(findIssueSheetTemplate("tpl_does_not_exist")).toBeUndefined();
  });

  it("finds every known template by key", () => {
    for (const template of issueSheetTemplates) {
      expect(findIssueSheetTemplate(template.key)).toBe(template);
    }
  });
});

describe("issueSheetTemplateLabel", () => {
  it("renders a label for every known template", () => {
    for (const template of issueSheetTemplates) {
      expect(issueSheetTemplateLabel(intl, template.key)).toBeTruthy();
    }
  });

  it("falls back to a formatted version of an unknown or removed key", () => {
    expect(issueSheetTemplateLabel(intl, "tpl_retired_template")).toBe("Retired Template");
  });
});

describe("issueSheetTemplateSkeleton", () => {
  it("renders a non-empty markdown skeleton with at least one heading for every template", () => {
    for (const template of issueSheetTemplates) {
      const skeleton = issueSheetTemplateSkeleton(intl, template.key);
      expect(skeleton).toMatch(/^## /);
    }
  });

  it("never asks for a field the create form already captures", () => {
    // Regression guard for the "requests only relevant evidence" acceptance criterion: none of
    // the skeletons should reintroduce a prompt for a field that already exists on the form.
    const forbidden = [/target ?locale/i, /source ?path/i, /priority/i, /assignee/i];
    for (const template of issueSheetTemplates) {
      const skeleton = issueSheetTemplateSkeleton(intl, template.key);
      for (const pattern of forbidden) {
        expect(skeleton).not.toMatch(pattern);
      }
    }
  });
});
