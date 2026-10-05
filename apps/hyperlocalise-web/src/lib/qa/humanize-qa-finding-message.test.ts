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

import { findingNeedsWhitespaceCue, humanizeQaFindingMessage } from "./humanize-qa-finding-message";

describe("humanizeQaFindingMessage", () => {
  it("keeps reviewer-facing messages unchanged", () => {
    expect(humanizeQaFindingMessage("The translation is missing {count}.")).toBe(
      "The translation is missing {count}.",
    );
  });

  it("strips invariant prefix, debug dump, and uses the parenthetical reason", () => {
    expect(
      humanizeQaFindingMessage(
        'translation invariant violation: whitespace profile mismatch (non-breaking space count differs from source) | source="$2,000 per month AI credit" candidate="$2.000 KI-Guthaben pro Monat" diff=at=0',
      ),
    ).toBe("Non-breaking space count differs from source");
  });

  it("capitalizes invariant messages that have no parenthetical", () => {
    expect(
      humanizeQaFindingMessage(
        'translation invariant violation: invalid ICU/braces structure | source="{count" candidate="{count}"',
      ),
    ).toBe("Invalid ICU/braces structure");
  });
});

describe("findingNeedsWhitespaceCue", () => {
  it("flags whitespace checks and invisible non-breaking spaces", () => {
    expect(
      findingNeedsWhitespaceCue({
        checkType: "format",
        message: "translation invariant violation: whitespace profile mismatch",
        sourceText: "Hello",
        targetText: "Hallo",
      }),
    ).toBe(true);
    expect(
      findingNeedsWhitespaceCue({
        checkType: "placeholder_mismatch",
        message: "The translation is missing {count}.",
        sourceText: "Hello\u00a0world",
        targetText: "Hallo Welt",
      }),
    ).toBe(true);
    expect(
      findingNeedsWhitespaceCue({
        checkType: "placeholder_mismatch",
        message: "The translation is missing {count}.",
        sourceText: "Hello world",
        targetText: "Hallo Welt",
      }),
    ).toBe(false);
  });
});
