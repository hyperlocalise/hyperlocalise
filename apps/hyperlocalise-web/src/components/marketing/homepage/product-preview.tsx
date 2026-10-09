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
import { useIntl } from "react-intl";

import { homepageMessages as m } from "./homepage.messages";

/** Homepage hero preview. YouTube watch/share URLs embed; other URLs use a file video. */
export const PRODUCT_PREVIEW_VIDEO_URL = "https://www.youtube.com/watch?v=wjDelLf57OM";

const YOUTUBE_VIDEO_ID_PATTERN = /^[\w-]{11}$/;
const YOUTUBE_HOSTS = new Set(["youtube.com", "m.youtube.com", "youtube-nocookie.com"]);

export function hasProductPreviewVideoUrl(url: string | null | undefined): boolean {
  return typeof url === "string" && url.trim().length > 0;
}

function isYouTubeVideoId(value: string | null | undefined): value is string {
  return typeof value === "string" && YOUTUBE_VIDEO_ID_PATTERN.test(value);
}

export function getYouTubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
  if (host === "youtu.be") {
    const id = parsed.pathname.split("/").find(Boolean);
    return isYouTubeVideoId(id) ? id : null;
  }

  if (!YOUTUBE_HOSTS.has(host)) {
    return null;
  }

  if (parsed.pathname === "/watch" || parsed.pathname === "/watch/") {
    const id = parsed.searchParams.get("v");
    return isYouTubeVideoId(id) ? id : null;
  }

  const pathMatch = /^\/(?:embed|shorts|live)\/([^/]+)/.exec(parsed.pathname);
  const id = pathMatch?.[1];
  return isYouTubeVideoId(id) ? id : null;
}

export function getYouTubeEmbedSrc(url: string): string | null {
  const id = getYouTubeVideoId(url);
  return id ? `https://www.youtube-nocookie.com/embed/${id}` : null;
}

export function ProductPreviewVideo({ src }: { src: string }) {
  const intl = useIntl();
  const youtubeEmbedSrc = getYouTubeEmbedSrc(src);
  const label = intl.formatMessage(m.preview);
  const frameClassName = "aspect-video w-full rounded-xl border border-white/15 bg-black/25";

  return (
    <div className="mx-auto mt-12 max-w-5xl rounded-2xl bg-white/10 p-2 sm:mt-16 sm:p-3">
      {youtubeEmbedSrc ? (
        <iframe
          className={frameClassName}
          src={youtubeEmbedSrc}
          title={label}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
        />
      ) : (
        <video
          className={frameClassName}
          src={src}
          controls
          playsInline
          preload="metadata"
          aria-label={label}
        />
      )}
    </div>
  );
}

export const PRODUCTS = [
  {
    id: "studio",
    href: "/product/multilingual-content-studio",
    title: m.studioCardTitle,
    short: m.studioShort,
    body: m.studioBody,
    mark: "Aa",
  },
  {
    id: "automation",
    href: "/product/agents-automation",
    title: m.automationCardTitle,
    short: m.automationShort,
    body: m.automationBody,
    mark: "↳",
  },
  {
    id: "domains",
    href: "/product/domains",
    title: m.domainsCardTitle,
    short: m.domainsShort,
    body: m.domainsBody,
    mark: "◎",
  },
  {
    id: "hyperlab",
    href: "/product/hyperlab",
    title: m.hyperlabCardTitle,
    short: m.hyperlabShort,
    body: m.hyperlabBody,
    mark: "A/B",
  },
  {
    id: "guidelines",
    href: "/product/guidelines",
    title: m.guidelinesCardTitle,
    short: m.guidelinesShort,
    body: m.guidelinesBody,
    mark: "≋",
  },
] as const;
