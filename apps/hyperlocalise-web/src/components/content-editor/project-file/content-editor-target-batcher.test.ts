"use client";

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
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import type { ProjectFileCatTargetsInput } from "@/api/routes/project/project.schema";
import { createTargetBatcher } from "./content-editor-target-batcher";

afterEach(() => vi.useRealTimers());
const cell = (id: number, targetLocale = "fr") => ({ sourcePath: "a.json", externalStringId: String(id), targetLocale });
const response = (body: ProjectFileCatTargetsInput) => body.segments.map((segment) => ({ ...segment,
    targets: Object.fromEntries(body.targetLocales.map((locale) => [locale, { text: locale + segment.externalStringId, isApproved: false, externalTranslationId: null }])),
}));

describe("native translation batches", () => {
    it("loads a 20 by 3 viewport with one request", async () => {
        vi.useFakeTimers();
        const fetch = vi.fn(async (body: ProjectFileCatTargetsInput) => response(body));
        const load = createTargetBatcher(fetch);
        const reads = Array.from({ length: 20 }, (_, i) => ["fr", "de", "es"].map((locale) => load(cell(i, locale)))).flat();
        await vi.runAllTimersAsync();
        expect(await Promise.all(reads)).toHaveLength(60);
        expect(fetch).toHaveBeenCalledTimes(1);
        expect(fetch.mock.calls[0][0].segments).toHaveLength(20);
    });
    it("bounds every rectangle and limits in-flight requests", async () => {
        vi.useFakeTimers();
        let active = 0;
        let peak = 0;
        const fetch = vi.fn(async (body: ProjectFileCatTargetsInput) => {
            active++; peak = Math.max(peak, active);
            expect(body.segments.length).toBeLessThanOrEqual(50);
            expect(body.targetLocales.length).toBeLessThanOrEqual(8);
            expect(body.segments.length * body.targetLocales.length).toBeLessThanOrEqual(200);
            await new Promise((resolve) => setTimeout(resolve, 10));
            active--; return response(body);
        });
        const load = createTargetBatcher(fetch);
        const reads = Array.from({ length: 100 }, (_, i) => Array.from({ length: 10 }, (_, j) => load(cell(i, "locale" + j)))).flat();
        await vi.runAllTimersAsync();
        await Promise.all(reads);
        expect(peak).toBeLessThanOrEqual(2);
    });
    it("cancels a departed cell without cancelling a shared visible cell", async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        const fetch = vi.fn(async (body: ProjectFileCatTargetsInput, batchSignal: AbortSignal) => {
            signal = batchSignal;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return response(body);
        });
        const load = createTargetBatcher(fetch);
        const controller = new AbortController();
        const gone = load(cell(1), controller.signal).catch((error: Error) => error.name);
        const visible = load(cell(2));
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        expect(signal?.aborted).toBe(false);
        await vi.runAllTimersAsync();
        expect(await gone).toBe("AbortError");
        expect((await visible)?.text).toBe("fr2");
    });
    it("aborts transport when the entire viewport leaves", async () => {
        vi.useFakeTimers();
        let signal: AbortSignal | undefined;
        const load = createTargetBatcher(async (body, batchSignal) => {
            signal = batchSignal;
            await new Promise((resolve) => setTimeout(resolve, 20));
            return response(body);
        });
        const controller = new AbortController();
        const read = load(cell(1), controller.signal).catch((error: Error) => error.name);
        await vi.advanceTimersByTimeAsync(0);
        controller.abort();
        expect(signal?.aborted).toBe(true);
        await vi.runAllTimersAsync();
        expect(await read).toBe("AbortError");
    });
});
