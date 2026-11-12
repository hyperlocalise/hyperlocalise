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
import type { LocalisationAuditPageLayout } from "./types";

export type RenderedHtmlPage = {
  requestedUrl: string;
  url: string;
  status: number;
  html: string;
  layout?: LocalisationAuditPageLayout | null;
};

export type HtmlPageRendererKind = "tilion" | "sandbox";

export type HtmlPageRenderer = {
  /** Which browser renders pages, for logs. The sandbox sends the audit bot user agent. */
  kind?: HtmlPageRendererKind;
  render(urls: string[]): Promise<RenderedHtmlPage[]>;
  /**
   * Fetches a text resource such as robots.txt or a sitemap through the same
   * browser, so it leaves from the same network and identity as rendered pages.
   * Returns null on a non-2xx/3xx status, a disallowed URL, or a failure.
   * Renderers without it fall back to a direct HTTP fetch.
   */
  fetchText?(url: string): Promise<string | null>;
  close(): Promise<void>;
};

export type CrawlLocalisationAuditSampleOptions = {
  createRenderer?: () => Promise<HtmlPageRenderer>;
  /** Opaque ids (audit id, attempt) bound to crawl logs. Never URLs or names. */
  logBindings?: Record<string, string | number>;
};
