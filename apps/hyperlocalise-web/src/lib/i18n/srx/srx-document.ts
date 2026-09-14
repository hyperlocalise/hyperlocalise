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

import { SRX_BUILTIN_XML } from "@/lib/i18n/srx/srx-builtin-xml";
import type { SrxBuiltinTemplate } from "@/lib/i18n/srx/srx-template-samples";

export type SrxBreakKind = "yes" | "no";

export type SrxBreakRule = {
  id: string;
  break: SrxBreakKind;
  beforeBreak: string;
  afterBreak: string;
};

export type SrxLanguageRule = {
  id: string;
  languageName: string;
  rules: SrxBreakRule[];
};

export type SrxLanguageMap = {
  id: string;
  languagePattern: string;
  languageRuleName: string;
};

export type SrxDocumentModel = {
  cascade: SrxBreakKind;
  languageRules: SrxLanguageRule[];
  languageMaps: SrxLanguageMap[];
};

export type SrxParseResult = { ok: true; model: SrxDocumentModel } | { ok: false; error: string };

export type SrxValidationIssue = {
  path: string;
  message: string;
};

export function createSrxId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `srx-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createEmptyBreakRule(): SrxBreakRule {
  return {
    id: createSrxId(),
    break: "yes",
    beforeBreak: "[\\.\\?!]+[\"']?",
    afterBreak: "\\s",
  };
}

export function createEmptyLanguageRule(languageName = "Default"): SrxLanguageRule {
  return {
    id: createSrxId(),
    languageName,
    rules: [createEmptyBreakRule()],
  };
}

export function createEmptyLanguageMap(languageRuleName = "Default"): SrxLanguageMap {
  return {
    id: createSrxId(),
    languagePattern: ".*",
    languageRuleName,
  };
}

export function createStarterSrxDocument(): SrxDocumentModel {
  const languageRule = createEmptyLanguageRule("Default");
  return {
    cascade: "no",
    languageRules: [languageRule],
    languageMaps: [createEmptyLanguageMap(languageRule.languageName)],
  };
}

export function loadBuiltinSrxDocument(template: SrxBuiltinTemplate): SrxParseResult {
  return parseSrxXml(SRX_BUILTIN_XML[template]);
}

function directChildren(parent: Element, localName: string): Element[] {
  return Array.from(parent.children).filter((child) => child.localName === localName);
}

function childText(parent: Element, localName: string): string {
  const child = directChildren(parent, localName)[0];
  return child?.textContent?.trim() ?? "";
}

function attrValue(element: Element, name: string): string {
  return element.getAttribute(name)?.trim() ?? "";
}

export function parseSrxXml(xml: string): SrxParseResult {
  const trimmed = xml.trim();
  if (!trimmed.startsWith("<")) {
    return { ok: false, error: "SRX document must be XML." };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(trimmed, "application/xml");
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return { ok: false, error: "Invalid XML." };
  }

  const root = doc.documentElement;
  if (root.localName !== "srx") {
    return { ok: false, error: "Root element must be <srx>." };
  }

  const header = directChildren(root, "header")[0];
  let cascade: SrxBreakKind = "no";
  if (header) {
    const cascadeValue = childText(header, "cascade").toLowerCase();
    if (cascadeValue === "yes") {
      cascade = "yes";
    } else if (cascadeValue && cascadeValue !== "no") {
      return { ok: false, error: "Header cascade must be yes or no." };
    }
  }

  const body = directChildren(root, "body")[0];
  if (!body) {
    return { ok: false, error: "<body> is required." };
  }

  const languageRulesContainer = directChildren(body, "languagerules")[0];
  if (!languageRulesContainer) {
    return { ok: false, error: "<languagerules> is required." };
  }

  const languageRuleElements = directChildren(languageRulesContainer, "languagerule");
  if (languageRuleElements.length === 0) {
    return { ok: false, error: "At least one <languagerule> is required." };
  }

  const languageRules: SrxLanguageRule[] = [];
  for (let i = 0; i < languageRuleElements.length; i++) {
    const element = languageRuleElements[i];
    const languageName = attrValue(element, "languagename");
    if (!languageName) {
      return { ok: false, error: `languagerules[${i}]: languagename is required.` };
    }

    const ruleElements = directChildren(element, "rule");
    const rules: SrxBreakRule[] = [];
    for (let j = 0; j < ruleElements.length; j++) {
      const ruleElement = ruleElements[j];
      const breakRaw = attrValue(ruleElement, "break").toLowerCase();
      let breakKind: SrxBreakKind;
      if (!breakRaw || breakRaw === "yes") {
        breakKind = "yes";
      } else if (breakRaw === "no") {
        breakKind = "no";
      } else {
        return {
          ok: false,
          error: `languagerules[${i}].rules[${j}]: invalid break "${breakRaw}".`,
        };
      }

      rules.push({
        id: createSrxId(),
        break: breakKind,
        beforeBreak: childText(ruleElement, "beforebreak"),
        afterBreak: childText(ruleElement, "afterbreak"),
      });
    }

    languageRules.push({
      id: createSrxId(),
      languageName,
      rules,
    });
  }

  const mapRulesContainer = directChildren(body, "maprules")[0];
  const languageMaps: SrxLanguageMap[] = [];
  if (mapRulesContainer) {
    const mapElements = directChildren(mapRulesContainer, "languagemap");
    for (const mapElement of mapElements) {
      languageMaps.push({
        id: createSrxId(),
        languagePattern: attrValue(mapElement, "languagepattern"),
        languageRuleName: attrValue(mapElement, "languagerulename"),
      });
    }
  }

  return {
    ok: true,
    model: {
      cascade,
      languageRules,
      languageMaps,
    },
  };
}

function escapeXmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value: string): string {
  return escapeXmlText(value).replaceAll('"', "&quot;");
}

export function serializeSrxXml(model: SrxDocumentModel): string {
  const header =
    model.cascade === "yes" ? `  <header>\n    <cascade>yes</cascade>\n  </header>\n` : "";

  const languageRuleBlocks = model.languageRules.map((languageRule) => {
    const ruleBlocks = languageRule.rules.map((rule) => {
      const parts = [
        `        <rule break="${rule.break}">`,
        rule.beforeBreak
          ? `          <beforebreak>${escapeXmlText(rule.beforeBreak)}</beforebreak>`
          : null,
        rule.afterBreak
          ? `          <afterbreak>${escapeXmlText(rule.afterBreak)}</afterbreak>`
          : null,
        "        </rule>",
      ].filter((line): line is string => line !== null);
      return parts.join("\n");
    });

    return [
      `      <languagerule languagename="${escapeXmlAttribute(languageRule.languageName)}">`,
      ruleBlocks.join("\n"),
      "      </languagerule>",
    ].join("\n");
  });

  const mapBlocks = model.languageMaps.map(
    (map) =>
      `      <languagemap languagepattern="${escapeXmlAttribute(map.languagePattern)}" languagerulename="${escapeXmlAttribute(map.languageRuleName)}"/>`,
  );

  const mapSection =
    mapBlocks.length > 0 ? ["    <maprules>", ...mapBlocks, "    </maprules>"].join("\n") : "";

  return `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
${header}  <body>
    <languagerules>
${languageRuleBlocks.join("\n")}
    </languagerules>
${mapSection}
  </body>
</srx>
`;
}

function compileSrxRegex(pattern: string): RegExp {
  const trimmed = pattern.trim();
  if (trimmed.startsWith("(?i)")) {
    return new RegExp(trimmed.slice(4), "i");
  }
  return new RegExp(trimmed);
}

export function validateSrxDocument(model: SrxDocumentModel): SrxValidationIssue[] {
  const issues: SrxValidationIssue[] = [];

  if (model.languageRules.length === 0) {
    issues.push({ path: "languageRules", message: "At least one language rule set is required." });
    return issues;
  }

  const languageNames = new Set<string>();
  for (let i = 0; i < model.languageRules.length; i++) {
    const languageRule = model.languageRules[i];
    const name = languageRule.languageName.trim();
    if (!name) {
      issues.push({
        path: `languageRules[${i}].languageName`,
        message: "Language rule name is required.",
      });
      continue;
    }
    if (languageNames.has(name)) {
      issues.push({
        path: `languageRules[${i}].languageName`,
        message: `Duplicate language rule name "${name}".`,
      });
    }
    languageNames.add(name);

    for (let j = 0; j < languageRule.rules.length; j++) {
      const rule = languageRule.rules[j];
      const before = rule.beforeBreak.trim();
      const after = rule.afterBreak.trim();
      if (!before && !after) {
        issues.push({
          path: `languageRules[${i}].rules[${j}]`,
          message: "Before break or after break pattern is required.",
        });
      }
      if (before) {
        try {
          compileSrxRegex(before);
        } catch (error) {
          issues.push({
            path: `languageRules[${i}].rules[${j}].beforeBreak`,
            message: `Invalid before break pattern: ${error instanceof Error ? error.message : "unknown error"}`,
          });
        }
      }
      if (after) {
        try {
          compileSrxRegex(after);
        } catch (error) {
          issues.push({
            path: `languageRules[${i}].rules[${j}].afterBreak`,
            message: `Invalid after break pattern: ${error instanceof Error ? error.message : "unknown error"}`,
          });
        }
      }
    }
  }

  for (let i = 0; i < model.languageMaps.length; i++) {
    const map = model.languageMaps[i];
    const pattern = map.languagePattern.trim();
    const ruleName = map.languageRuleName.trim();
    if (!pattern) {
      issues.push({
        path: `languageMaps[${i}].languagePattern`,
        message: "Language pattern is required.",
      });
    } else {
      try {
        new RegExp(pattern, "i");
      } catch (error) {
        issues.push({
          path: `languageMaps[${i}].languagePattern`,
          message: `Invalid language pattern: ${error instanceof Error ? error.message : "unknown error"}`,
        });
      }
    }
    if (!ruleName) {
      issues.push({
        path: `languageMaps[${i}].languageRuleName`,
        message: "Target language rule name is required.",
      });
    } else if (!languageNames.has(ruleName)) {
      issues.push({
        path: `languageMaps[${i}].languageRuleName`,
        message: `Unknown language rule name "${ruleName}".`,
      });
    }
  }

  return issues;
}
