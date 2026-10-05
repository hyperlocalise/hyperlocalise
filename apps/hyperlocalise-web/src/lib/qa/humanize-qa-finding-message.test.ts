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

import { humanizeQaFindingMessage } from "./humanize-qa-finding-message";

describe("humanizeQaFindingMessage", () => {
  it("keeps reviewer-facing messages unchanged", () => {
    expect(humanizeQaFindingMessage("The translation is missing {count}.")).toBe(
      "The translation is missing {count}.",
    );
  });

  it("does not treat glossary terms as scanner debug suffixes", () => {
    expect(
      humanizeQaFindingMessage('Glossary term "API | source=legacy" requires "Schnittstelle".'),
    ).toBe('Glossary term "API | source=legacy" requires "Schnittstelle".');
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

  it("keeps placeholder and special-character parity kinds with expected values", () => {
    expect(
      humanizeQaFindingMessage(
        'translation invariant violation: placeholder parity mismatch (expected ["{name}"], got []) | source="Hello {name}" candidate="Hallo"',
      ),
    ).toBe('Placeholder parity mismatch: expected ["{name}"], got []');
    expect(
      humanizeQaFindingMessage(
        'translation invariant violation: special character parity mismatch (expected [\\n], got [\\t]) | source="a\\n" candidate="a\\t"',
      ),
    ).toBe("Special character parity mismatch: expected [\\n], got [\\t]");
  });
});
