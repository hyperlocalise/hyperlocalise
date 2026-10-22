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

const sampleVtt = `WEBVTT

NOTE Intro credits

STYLE
::cue { color: white }

intro
00:00:00.000 --> 00:00:02.500 align:start
Hello world

00:00:02.500 --> 00:00:05.000
This is a subtitle
on two lines
`;

const sampleSbv = `0:00:00.000,0:00:04.000
Welcome to the product tour.

0:00:04.180,0:00:06.560
Open your project
to begin.
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

  it("preserves VTT header notes and settings", () => {
    const result = marshalSubtitles(
      sampleVtt,
      {
        "vtt.0001": "Bonjour le monde",
        "vtt.0002": "Ceci est un sous-titre\nsur deux lignes",
      },
      "vtt",
    );
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    const text = result.value.toString("utf8");
    expect(text.startsWith("WEBVTT\n")).toBe(true);
    expect(text).toContain("NOTE Intro credits");
    expect(text).toContain("::cue { color: white }");
    expect(text).toContain("intro\n00:00:00.000 --> 00:00:02.500 align:start\nBonjour le monde\n");
  });

  it("replaces SBV cue text while preserving timestamps", () => {
    const result = marshalSubtitles(sampleSbv, { "sbv.0001": "Bienvenue." }, "sbv");
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    const text = result.value.toString("utf8");
    expect(text).toContain("Bienvenue.");
    expect(text).toContain("0:00:00.000,0:00:04.000");
  });

  it("preserves CRLF and drops blank cue lines", () => {
    const template = "1\r\n00:00:00,000 --> 00:00:01,000\r\nHello\r\n\r\n";
    const result = marshalSubtitles(template, { "srt.0001": "Bonjour\n\nle monde\n" }, "srt");
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    expect(result.value.toString("utf8")).toBe(
      "1\r\n00:00:00,000 --> 00:00:01,000\r\nBonjour\r\nle monde\r\n\r\n",
    );
  });

  it("keeps source cue text when a key is missing", () => {
    const result = marshalSubtitles(sampleSrt, { "srt.0001": "Bonjour le monde" }, "srt");
    expect(isErr(result)).toBe(false);
    if (isErr(result)) {
      return;
    }
    const text = result.value.toString("utf8");
    expect(text).toContain("Bonjour le monde");
    expect(text).toContain("This is a subtitle\non two lines");
  });
});
