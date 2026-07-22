#!/usr/bin/env node
/**
 * Adds MariaDB-style Business Source License headers to source files under
 * BSL-licensed Hyperlocalise apps. Idempotent: skips files that already carry
 * a Hyperlocalise Pty Ltd BSL header.
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
    "storybook-static",
    "out",
    "vendor",
    "Generated",
]);

const HEADER_MARKER = "Use of this software is governed by the Business Source License";

const JS_HEADER = `/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
`;

const SWIFT_HEADER = `/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
`;

const CSS_HEADER = JS_HEADER;

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

            // Generated FormatJS / locale catalogs are not source files.
            if (dir.includes(`${path.sep}lang${path.sep}`) && entry.name.endsWith(".json")) {
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

    // Preserve BOM if present on the first line.
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
            // Keep a single blank line after the directive if present.
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
    if (content.includes(HEADER_MARKER)) {
        return { content, changed: false };
    }

    const { prefix, rest } = splitLeadingDirectives(content);
    const body = rest.startsWith("\n") ? rest : rest.length === 0 ? "" : `\n${rest}`;
    const next =
        prefix.length === 0
            ? `${header}${body.replace(/^\n/, "")}`
            : `${prefix}\n${header}${body.replace(/^\n/, "")}`;

    // Normalize trailing newline.
    const normalized = next.endsWith("\n") ? next : `${next}\n`;
    return { content: normalized, changed: true };
}

function processFile(filePath, check) {
    const original = fs.readFileSync(filePath, "utf8");
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
            } else {
                skipped += 1;
            }
        }
    }

    if (check) {
        console.log(`check complete: missing=${missing} ok=${skipped}`);
        if (missing > 0) {
            process.exitCode = 1;
        }
        return;
    }

    console.log(`done: updated=${updated} already-present=${skipped}`);
}

main();
