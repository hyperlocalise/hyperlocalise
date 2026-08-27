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
    buildFigmaSourcePath,
    figmaSegmentKey,
    parseTranslationFile,
    segmentsToTranslationFile,
} from "./segment-file";

describe("figma segment file", () => {
    it("builds stable keys and source paths", () => {
        expect(figmaSegmentKey("12:34", 0)).toBe("figma.segment.12:34.0");
        expect(buildFigmaSourcePath("abc123")).toBe("figma/files/abc123.json");
    });

    it("round-trips translation files and skips empty text", () => {
        const file = segmentsToTranslationFile([
            { key: "figma.segment.1:1.0", nodeId: "1:1", regionIndex: 0, text: "Hello" },
            { key: "figma.segment.1:2.0", nodeId: "1:2", regionIndex: 0, text: "   " },
        ]);

        expect(file).toEqual({ "figma.segment.1:1.0": "Hello" });
        expect(
            parseTranslationFile({
                "figma.segment.1:1.0": "Hola",
                ignored: 1,
                other: "skip",
            }),
        ).toEqual({ "figma.segment.1:1.0": "Hola" });
    });
});
