#!/usr/bin/env node
/**
 * Adds MariaDB-style Business Source License headers to source files under
 * BSL-licensed Hyperlocalise apps. Idempotent: inserts or rewrites headers so
 * they match the canonical Hyperlocalise Pty Ltd BSL header.
 *
 * Usage:
 *   node scripts/add-bsl-headers.mjs [--check] [app...]
 *
 * Examples:
 *   node scripts/add-bsl-headers.mjs
 *   node scripts/add-bsl-headers.mjs apps/mac-app
 *   node scripts/add-bsl-headers.mjs --check
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const DEFAULT_APPS = [
    "apps/hyperlocalise-web",
    "apps/canva-app",
    "apps/mac-app",
];

const SOURCE_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".css",
    ".swift",
]);

const SKIP_DIR_NAMES = new Set([
    ".git",
    ".next",
    ".turbo",
    "node_modules",
    "dist",
    "build",
    "coverage",
    "public",
    "storybook-static",
    "out",
    "vendor",
    "Generated",
]);

const JS_HEADER = `/*
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
`;

const SWIFT_HEADER = JS_HEADER;
const CSS_HEADER = JS_HEADER;

const EXISTING_HEADER_RE =
    /^\/\*\s*\n(?: \*[^\n]*\n)*? \* Use of this software is governed by the Business Source License[^\n]*\n(?: \*[^\n]*\n)*? \*\/\n?/;
const HEADER_MARKER = "Use of this software is governed by the Business Source License";
const SEPARATE_NOTICE_RE =
    /copyright|spdx-license-identifier|please do not modify|do not edit|@generated|auto-?generated/i;

function parseArgs(argv) {
    const check = argv.includes("--check");
    const apps = argv.filter((arg) => arg !== "--check");
    return {
        check,
        apps: apps.length > 0 ? apps : DEFAULT_APPS,
    };
}

function shouldSkipDir(name) {
    return SKIP_DIR_NAMES.has(name) || name.startsWith(".");
}

function collectSourceFiles(appRoot) {
    const files = [];

    function walk(dir) {
        let entries;
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }

        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (shouldSkipDir(entry.name)) {
                    continue;
                }
                walk(path.join(dir, entry.name));
                continue;
            }

            if (!entry.isFile()) {
                continue;
            }

            const ext = path.extname(entry.name);
            if (!SOURCE_EXTENSIONS.has(ext)) {
                continue;
            }

            files.push(path.join(dir, entry.name));
        }
    }

    walk(appRoot);
    return files;
}

function splitLeadingDirectives(content) {
    const lines = content.split(/\r?\n/);
    let index = 0;

    while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();

        if (index === 0 && trimmed === "") {
            index += 1;
            continue;
        }

        if (trimmed.startsWith("#!")) {
            index += 1;
            continue;
        }

        if (
            trimmed === '"use client";' ||
            trimmed === "'use client';" ||
            trimmed === '"use server";' ||
            trimmed === "'use server';"
        ) {
            index += 1;
            if (index < lines.length && lines[index].trim() === "") {
                index += 1;
            }
            continue;
        }

        break;
    }

    const prefix = lines.slice(0, index).join("\n");
    const rest = lines.slice(index).join("\n");
    return { prefix, rest };
}

function headerForFile(filePath) {
    const ext = path.extname(filePath);
    if (ext === ".swift") {
        return SWIFT_HEADER;
    }
    if (ext === ".css") {
        return CSS_HEADER;
    }
    return JS_HEADER;
}

function ensureHeader(content, header) {
    const bom = content.startsWith("\uFEFF") ? "\uFEFF" : "";
    const source = bom ? content.slice(1) : content;
    const { prefix, rest } = splitLeadingDirectives(source);
    let body = rest;

    if (EXISTING_HEADER_RE.test(body)) {
        body = body.replace(EXISTING_HEADER_RE, header);
    } else if (body.startsWith(header)) {
        // Canonical header already present.
    } else {
        body = `${header}${body.replace(/^\n/, "")}`;
    }

    const next = prefix.length === 0 ? body : `${prefix}\n${body.replace(/^\n/, "")}`;
    const normalizedBody = next.endsWith("\n") ? next : `${next}\n`;
    const normalized = `${bom}${normalizedBody}`;
    return { content: normalized, changed: normalized !== content };
}

function shouldExcludeContent(content) {
    return !content.includes(HEADER_MARKER) && SEPARATE_NOTICE_RE.test(content);
}

function processFile(filePath, check) {
    const original = fs.readFileSync(filePath, "utf8");
    if (shouldExcludeContent(original)) {
        return "excluded";
    }

    const header = headerForFile(filePath);
    const { content, changed } = ensureHeader(original, header);

    if (!changed) {
        return "skipped";
    }

    if (check) {
        return "missing";
    }

    fs.writeFileSync(filePath, content, "utf8");
    return "updated";
}

function main() {
    const { check, apps } = parseArgs(process.argv.slice(2));
    let updated = 0;
    let skipped = 0;
    let missing = 0;
    let excluded = 0;

    for (const app of apps) {
        const appRoot = path.resolve(ROOT, app);
        if (!fs.existsSync(appRoot)) {
            console.error(`App path not found: ${app}`);
            process.exitCode = 1;
            continue;
        }

        const files = collectSourceFiles(appRoot);
        for (const file of files) {
            const result = processFile(file, check);
            if (result === "updated") {
                updated += 1;
                console.log(`updated ${path.relative(ROOT, file)}`);
            } else if (result === "missing") {
                missing += 1;
                console.log(`missing ${path.relative(ROOT, file)}`);
            } else if (result === "excluded") {
                excluded += 1;
            } else {
                skipped += 1;
            }
        }
    }

    if (check) {
        console.log(`check complete: missing=${missing} ok=${skipped} excluded=${excluded}`);
        if (missing > 0) {
            process.exitCode = 1;
        }
        return;
    }

    console.log(`done: updated=${updated} already-present=${skipped} excluded=${excluded}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main();
}

export { ensureHeader, JS_HEADER, shouldExcludeContent };
