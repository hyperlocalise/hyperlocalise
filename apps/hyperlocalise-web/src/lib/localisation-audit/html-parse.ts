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
import { Parser } from "htmlparser2";

export type ParsedPageSignals = {
  htmlLang: string | null;
  title: string | null;
  textSample: string;
  hreflang: Array<{ locale: string; href: string }>;
  anchors: Array<{ href: string; text: string }>;
};

const MAX_TEXT_SAMPLE = 4_000;
const MAX_ANCHORS = 80;

export function parsePageSignals(html: string): ParsedPageSignals {
  let htmlLang: string | null = null;
  let title: string | null = null;
  let inTitle = false;
  let titleBuffer = "";
  let inScriptOrStyle = false;
  const textChunks: string[] = [];
  const hreflang: Array<{ locale: string; href: string }> = [];
  const anchors: Array<{ href: string; text: string }> = [];
  let currentAnchor: { href: string; textParts: string[] } | null = null;

  const parser = new Parser(
    {
      onopentag(name, attributes) {
        const tag = name.toLowerCase();
        if (tag === "html" && attributes.lang) {
          htmlLang = attributes.lang.trim();
        }
        if (tag === "script" || tag === "style" || tag === "noscript") {
          inScriptOrStyle = true;
        }
        if (tag === "title") {
          inTitle = true;
          titleBuffer = "";
        }
        if (tag === "link") {
          const rel = (attributes.rel ?? "").toLowerCase();
          if (rel.split(/\s+/).includes("alternate") && attributes.hreflang && attributes.href) {
            hreflang.push({
              locale: attributes.hreflang.trim(),
              href: attributes.href.trim(),
            });
          }
        }
        if (tag === "a" && attributes.href && anchors.length < MAX_ANCHORS) {
          currentAnchor = { href: attributes.href.trim(), textParts: [] };
        }
      },
      ontext(text) {
        if (inTitle) {
          titleBuffer += text;
        }
        if (currentAnchor) {
          currentAnchor.textParts.push(text);
        }
        if (!inScriptOrStyle && !inTitle) {
          const cleaned = text.replace(/\s+/g, " ").trim();
          if (cleaned) {
            textChunks.push(cleaned);
          }
        }
      },
      onclosetag(name) {
        const tag = name.toLowerCase();
        if (tag === "script" || tag === "style" || tag === "noscript") {
          inScriptOrStyle = false;
        }
        if (tag === "title") {
          inTitle = false;
          title = titleBuffer.replace(/\s+/g, " ").trim() || null;
        }
        if (tag === "a" && currentAnchor) {
          anchors.push({
            href: currentAnchor.href,
            text: currentAnchor.textParts.join(" ").replace(/\s+/g, " ").trim(),
          });
          currentAnchor = null;
        }
      },
    },
    { decodeEntities: true },
  );

  parser.write(html);
  parser.end();

  let textSample = textChunks.join(" ");
  if (textSample.length > MAX_TEXT_SAMPLE) {
    textSample = `${textSample.slice(0, MAX_TEXT_SAMPLE)}…`;
  }

  return { htmlLang, title, textSample, hreflang, anchors };
}
