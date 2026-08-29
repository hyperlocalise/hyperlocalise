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
import type { ContentEditorFormatMessageIntl } from "@/components/content-editor/message-format/content-editor-message-format-i18n";
import { contentEditorGlossaryChecksMessages } from "@/components/content-editor/shared/content-editor.messages";
import type {
  ContentEditorFormatCheck,
  ContentEditorGlossaryTerm,
} from "@/components/content-editor/shared/types";

const UNICODE_WORD_CHAR = String.raw`\p{L}\p{N}_`;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function containsGlossaryTerm(text: string, term: string) {
  const normalizedTerm = term.trim();
  if (!normalizedTerm) {
    return false;
  }

  const patternStr = `(?<![${UNICODE_WORD_CHAR}])${escapeRegExp(normalizedTerm)}(?![${UNICODE_WORD_CHAR}])`;
  return new RegExp(patternStr, "iu").test(text);
}

export function glossaryFormatChecksForSegment(
  sourceText: string,
  targetText: string,
  glossaryTerms: ContentEditorGlossaryTerm[],
  intl: ContentEditorFormatMessageIntl,
): ContentEditorFormatCheck[] {
  if (glossaryTerms.length === 0 || !targetText.trim()) {
    return [];
  }

  const checks: ContentEditorFormatCheck[] = [];
  let evaluatedTermCount = 0;

  for (const term of glossaryTerms) {
    if (term.forbidden) {
      evaluatedTermCount += 1;
      if (containsGlossaryTerm(targetText, term.source)) {
        checks.push({
          id: `glossary-forbidden-${term.id}`,
          label: intl.formatMessage(contentEditorGlossaryChecksMessages.forbiddenTermLabel),
          status: "fail",
          message: intl.formatMessage(contentEditorGlossaryChecksMessages.forbiddenTermMessage, {
            term: term.source,
          }),
          category: "glossary",
          relatedTokens: [term.source],
        });
      }
      continue;
    }

    if (!term.approved) {
      continue;
    }

    if (!containsGlossaryTerm(sourceText, term.source)) {
      continue;
    }

    const expectedTarget = term.target.trim();
    if (!expectedTarget) {
      continue;
    }

    evaluatedTermCount += 1;

    if (!containsGlossaryTerm(targetText, expectedTarget)) {
      checks.push({
        id: `glossary-missing-${term.id}`,
        label: intl.formatMessage(contentEditorGlossaryChecksMessages.missingTermLabel),
        status: "warn",
        message: intl.formatMessage(contentEditorGlossaryChecksMessages.missingTermMessage, {
          sourceTerm: term.source,
          targetTerm: expectedTarget,
        }),
        category: "glossary",
        relatedTokens: [term.source, expectedTarget],
      });
    }
  }

  if (evaluatedTermCount > 0 && checks.length === 0) {
    checks.push({
      id: "glossary-compliance",
      label: intl.formatMessage(contentEditorGlossaryChecksMessages.complianceLabel),
      status: "pass",
      message: intl.formatMessage(contentEditorGlossaryChecksMessages.compliancePassMessage),
      category: "glossary",
    });
  }

  return checks;
}
