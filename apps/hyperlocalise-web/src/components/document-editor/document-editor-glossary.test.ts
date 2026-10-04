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

import { checkDocumentGlossary } from "./document-editor-glossary";

const term = (id: string, source: string, target: string, forbidden = false) => ({
  id,
  source,
  target,
  approved: !forbidden,
  forbidden,
});

describe("checkDocumentGlossary", () => {
  it("reports missing approved terms and used forbidden terms, worst first", () => {
    const findings = checkDocumentGlossary(
      [
        term("a", "workspace", "espace de travail"),
        term("b", "project", "projet"),
        term("c", "pick", "choisissez", true),
        term("d", "billing", "facturation"),
      ],
      "Open the Workspace and pick a project.",
      "Ouvrez l'espace et choisissez un projet.",
    );

    expect(findings.map((finding) => [finding.term.id, finding.status])).toEqual([
      ["c", "forbidden"],
      ["a", "missing"],
      ["b", "ok"],
    ]);
  });
});
