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

import { validateSecondaryLocaleComponentWrite, wfComponentIntegrityMatches } from "./wf-component";

describe("wf-component", () => {
  it("rejects secondary locale writes without data-w-id", () => {
    const source =
      '<p>Hi</p><wf-component component-id="abc" data-w-id="inst-1" prop-title="Heads up"></wf-component>';
    const patch =
      '<p>Bonjour</p><wf-component component-id="abc" prop-title="Attention"></wf-component>';
    const result = validateSecondaryLocaleComponentWrite({ sourceHtml: source, patchHtml: patch });
    expect(result.ok).toBe(false);
  });

  it("accepts translated props when instance ids match", () => {
    const source =
      '<p>Hi</p><wf-component component-id="abc" data-w-id="inst-1" prop-title="Heads up"></wf-component>';
    const patch =
      '<p>Bonjour</p><wf-component component-id="abc" data-w-id="inst-1" prop-title="Attention"></wf-component>';
    expect(wfComponentIntegrityMatches(source, patch)).toBe(true);
    expect(validateSecondaryLocaleComponentWrite({ sourceHtml: source, patchHtml: patch }).ok).toBe(
      true,
    );
  });
});
