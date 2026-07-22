import assert from "node:assert/strict";
import test from "node:test";

import {
    ensureHeader,
    JS_HEADER,
    shouldExcludeContent,
} from "./add-bsl-headers.mjs";

test("adds the canonical header to an owned source file", () => {
    const result = ensureHeader("export const value = 1;\n", JS_HEADER);

    assert.equal(result.changed, true);
    assert.equal(result.content, `${JS_HEADER}export const value = 1;\n`);
});

test("keeps framework directives before the header", () => {
    const result = ensureHeader(
        '"use client";\n\nexport const value = 1;\n',
        JS_HEADER,
    );

    assert.equal(
        result.content,
        `"use client";\n\n${JS_HEADER}export const value = 1;\n`,
    );
});

test("rewrites an existing BSL header without duplicating it", () => {
    const oldHeader = JS_HEADER.replace(
        "included in this application's LICENSE file.",
        "included in the LICENSE file and at https://mariadb.com/bsl11/.",
    );
    const result = ensureHeader(`${oldHeader}export const value = 1;\n`, JS_HEADER);

    assert.equal(result.changed, true);
    assert.equal(result.content, `${JS_HEADER}export const value = 1;\n`);
    assert.equal(result.content.includes("mariadb.com"), false);
});

test("preserves a byte-order mark", () => {
    const result = ensureHeader("\uFEFFexport const value = 1;\n", JS_HEADER);

    assert.equal(result.content.startsWith(`\uFEFF${JS_HEADER}`), true);
});

test("leaves generated and separately licensed files alone", () => {
    assert.equal(
        shouldExcludeContent("/* SPDX-License-Identifier: MIT */\nexport {};\n"),
        true,
    );
    assert.equal(
        shouldExcludeContent("/* Please do NOT modify this generated file. */\n"),
        true,
    );
    assert.equal(shouldExcludeContent(`${JS_HEADER}export {};\n`), false);
});
