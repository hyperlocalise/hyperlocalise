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
// @vitest-environment happy-dom

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vite-plus/test";

import { renderWithContentEditorProviders } from "@/components/content-editor/shared/content-editor-test-utils";

import { ContentEditorLockedStringBadge } from "./content-editor-locked-string-badge";

describe("ContentEditorLockedStringBadge", () => {
  it("renders the Locked label", () => {
    renderWithContentEditorProviders(<ContentEditorLockedStringBadge />);

    expect(screen.getByText("Locked")).toBeInTheDocument();
  });
});
