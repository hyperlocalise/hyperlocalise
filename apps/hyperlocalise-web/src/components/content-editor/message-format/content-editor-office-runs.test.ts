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
  joinOfficeTarget,
  officeRunDisplayLines,
  officeRunLayout,
  splitOfficeTarget,
} from "./content-editor-office-runs";

const open = "\u001eHLOXPH_6F30_0\u001f";
const close = "\u001eHLOXPH_6330_1\u001f";

describe("officeRunLayout", () => {
  it("splits leading open token and trailing text", () => {
    const source = `${open}Serves ${close}8 people`;
    const layout = officeRunLayout(source);

    expect(layout?.runs).toEqual(["Serves ", "8 people"]);
    expect(layout?.clusters).toEqual([open, close, ""]);
  });

  it("splits text before the first token", () => {
    const source = `Read the ${open}terms${close} first.`;
    const layout = officeRunLayout(source);

    expect(layout?.runs).toEqual(["Read the ", "terms", " first."]);
    expect(layout?.clusters[0]).toBe("");
    expect(layout?.clusters[1]).toBe(open);
    expect(layout?.clusters[2]).toBe(close);
  });

  it("returns null when markup is not Office-only", () => {
    const md = "\u001eHLMDPH_8E6DFE8F53EA_0\u001f";
    expect(officeRunLayout(`${md}Title`)).toBeNull();
  });
});

describe("splitOfficeTarget and joinOfficeTarget", () => {
  const source = `${open}Serves ${close}8 people`;

  it("round-trips translated runs", () => {
    const layout = officeRunLayout(source)!;
    const target = `${open}4人分${close}8人`;
    const lines = splitOfficeTarget(target, layout);

    expect(lines).toEqual(["4人分", "8人"]);
    expect(joinOfficeTarget(["4人分", "8人"], layout)).toBe(target);
  });

  it("reapplies source run edge whitespace", () => {
    const spacedSource = `${open}Serves ${close}8 people `;
    const layout = officeRunLayout(spacedSource)!;
    const target = joinOfficeTarget(["4人分", "8人"], layout);

    expect(target).toBe(`${open}4人分${close}8人 `);
  });

  it("returns null when token order does not match", () => {
    const layout = officeRunLayout(source)!;
    const reordered = `${close}8 people${open}Serves `;

    expect(splitOfficeTarget(reordered, layout)).toBeNull();
  });

  it("starts from empty lines", () => {
    const layout = officeRunLayout(source)!;

    expect(splitOfficeTarget("", layout)).toEqual(["", ""]);
  });

  it("keeps hard breaks inside a run", () => {
    const sourceWithBreak = `${open}Line one\nLine two${close}Tail`;
    const layout = officeRunLayout(sourceWithBreak)!;
    const target = `${open}A\nB${close}C`;
    const lines = splitOfficeTarget(target, layout);

    expect(lines).toEqual(["A\nB", "C"]);
  });
});

describe("officeRunDisplayLines", () => {
  it("shows one visible line per run without OX labels", () => {
    const message = `${open}Serves ${close}8 people`;

    expect(officeRunDisplayLines(message)).toEqual(["Serves", "8 people"]);
  });
});
