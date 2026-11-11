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
import { extractEmailStyleSettings, isHubspotJsonObject } from "@/lib/hubspot/document";

/**
 * Marker attribute for the preview-only canvas stylesheet injected into
 * HubSpot email documents. `serializeDesignModeDocument` strips elements
 * carrying it so the canvas never persists into saved files.
 */
export const HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER = "data-hl-preview-canvas";

/**
 * HubSpot email copy documents are the only files built with `data-hl-kind`
 * sections, so the marker identifies them without needing the source path.
 */
export function isHubspotEmailCopyHtml(html: string): boolean {
  return /<section\b[^>]*\bdata-hl-kind="(?:text|html)"/i.test(html);
}

function sanitizedHexColor(value: unknown): string | null {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{3,8}$/.test(value)) {
    return null;
  }
  return value;
}

function sanitizedFontFamily(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0 || value.length > 80) {
    return null;
  }
  if (!/^[A-Za-z0-9 ,'"-]+$/.test(value)) {
    return null;
  }
  return value;
}

function sanitizedBodyWidth(value: unknown): number | null {
  const width = typeof value === "string" && /^\d{1,4}$/.test(value) ? Number(value) : null;
  if (width === null || width < 320 || width > 1200) {
    return null;
  }
  return width;
}

function previewAccents(html: string): { background: string; font: string; width: number } {
  const fallback = { background: "#f3f4f6", font: "Arial, Helvetica, sans-serif", width: 600 };
  const settings = extractEmailStyleSettings(html);
  if (settings === undefined || !isHubspotJsonObject(settings)) {
    return fallback;
  }
  return {
    background: sanitizedHexColor(settings.backgroundColor) ?? fallback.background,
    font: `${sanitizedFontFamily(settings.primaryFont) ?? "Arial"}, Helvetica, sans-serif`,
    width: sanitizedBodyWidth(settings.emailBodyWidth) ?? fallback.width,
  };
}

function previewCss(html: string): string {
  const accents = previewAccents(html);
  return [
    `body{background:${accents.background} !important;margin:0;padding:24px 12px;}`,
    `section[data-hl-field]{max-width:${accents.width}px;margin:0 auto 12px;background:#ffffff;border-radius:8px;padding:20px 24px;font-family:${accents.font};color:#1f2937;line-height:1.6;}`,
    `section[data-hl-field="subject"]{font-size:20px;font-weight:700;}`,
    `section[data-hl-field="previewText"]{color:#6b7280;font-size:13px;}`,
    `script[${HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER}],script[data-hl-meta]{display:none !important;}`,
  ].join("");
}

/**
 * Wrap a HubSpot email copy document in a preview-only email canvas.
 * Returns other files unchanged, and never double-wraps. The injected
 * stylesheet carries the preview marker so serialization strips it.
 */
export function hubspotEmailPreviewSrcDoc(html: string): string {
  if (!isHubspotEmailCopyHtml(html) || html.includes(HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER)) {
    return html;
  }
  const style = `<style ${HUBSPOT_EMAIL_PREVIEW_STYLE_MARKER}>${previewCss(html)}</style>`;
  const headClose = /<\/head\s*>/i.exec(html);
  if (headClose?.index !== undefined) {
    const at = headClose.index;
    return `${html.slice(0, at)}${style}${html.slice(at)}`;
  }
  const bodyOpen = /<body\b[^>]*>/i.exec(html);
  if (bodyOpen) {
    const at = bodyOpen.index + bodyOpen[0].length;
    return `${html.slice(0, at)}${style}${html.slice(at)}`;
  }
  return `${style}${html}`;
}
