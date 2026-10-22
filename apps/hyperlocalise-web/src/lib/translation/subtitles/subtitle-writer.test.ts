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

import { isErr } from "@/lib/primitives/result/results";

import { marshalSubtitles } from "./subtitle-writer";

const sampleSrt = `1
00:00:00,000 --> 00:00:02,500
Hello world

2
00:00:02,500 --> 00:00:05,000
This is a subtitle
on two lines

3
00:00:05,000 --> 00:00:07,000
<i>Italic line</i>
`;

describe("marshalSubtitles", () => {
  it("replaces SRT cue text while preserving timings", () => {
    const result = marshalSubtitles(sampleSrt, { "srt.0001": "Bonjour le monde" }, "srt");
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    const text = result.value.toString("utf8");
    expect(text).toContain("Bonjour le monde");
    expect(text).toContain("00:00:00,000 --> 00:00:02,500");
    expect(text).toContain("This is a subtitle\non two lines");
  });
});
