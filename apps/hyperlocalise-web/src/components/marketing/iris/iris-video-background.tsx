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
import { useReducedMotion } from "motion/react";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useIntl } from "react-intl";

import { irisPageMessages } from "./iris-page.messages";
import {
  IRIS_LAUNCH_YOUTUBE_ID,
  irisLaunchEmbedSrc,
  irisLaunchPosterSrc,
} from "@/lib/iris/iris-waitlist";

export type IrisYoutubePlayerHandle = {
  setMuted: (muted: boolean) => void;
};

const YOUTUBE_ORIGIN = "https://www.youtube.com";

function postYoutubeCommand(iframe: HTMLIFrameElement, func: string, args: unknown[] = []) {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func, args }),
    YOUTUBE_ORIGIN,
  );
}

function disableYoutubeCaptions(iframe: HTMLIFrameElement) {
  postYoutubeCommand(iframe, "setOption", ["captions", "track", {}]);
  postYoutubeCommand(iframe, "setOption", ["cc", "track", {}]);
  postYoutubeCommand(iframe, "unloadModule", ["captions"]);
  postYoutubeCommand(iframe, "unloadModule", ["cc"]);
}

function parseYoutubeMessage(data: unknown) {
  if (typeof data === "string") {
    try {
      return JSON.parse(data) as { event?: string; info?: { playerState?: number } };
    } catch {
      return null;
    }
  }

  if (data && typeof data === "object") {
    return data as { event?: string; info?: { playerState?: number } };
  }

  return null;
}

type IrisVideoBackgroundProps = {
  onPlaybackReady?: () => void;
  playerRef?: Ref<IrisYoutubePlayerHandle>;
};

export function IrisVideoBackground({ onPlaybackReady, playerRef }: IrisVideoBackgroundProps) {
  const intl = useIntl();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const [motionPreferenceReady, setMotionPreferenceReady] = useState(false);
  const [posterSrc, setPosterSrc] = useState(irisLaunchPosterSrc);
  const label = intl.formatMessage(irisPageMessages.videoLabel);
  const showIframe = motionPreferenceReady && shouldReduceMotion === false;
  const showPoster = motionPreferenceReady && shouldReduceMotion === true;

  useImperativeHandle(playerRef, () => ({
    setMuted(muted) {
      const iframe = iframeRef.current;
      if (!iframe) {
        return;
      }

      postYoutubeCommand(iframe, muted ? "mute" : "unMute");
      if (!muted) {
        postYoutubeCommand(iframe, "setVolume", [100]);
      }
    },
  }));

  useEffect(() => {
    setMotionPreferenceReady(true);
  }, []);

  useEffect(() => {
    if (showIframe) {
      onPlaybackReady?.();
    }
  }, [onPlaybackReady, showIframe]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !showIframe) {
      return;
    }

    const startPlayback = () => {
      iframe.contentWindow?.postMessage(
        JSON.stringify({ event: "listening", id: 1 }),
        YOUTUBE_ORIGIN,
      );
      postYoutubeCommand(iframe, "playVideo");
      postYoutubeCommand(iframe, "mute");
      disableYoutubeCaptions(iframe);
    };

    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow && event.origin !== YOUTUBE_ORIGIN) {
        return;
      }

      const payload = parseYoutubeMessage(event.data);
      if (
        payload?.event === "onReady" ||
        payload?.event === "initialDelivery" ||
        payload?.info?.playerState === 1
      ) {
        disableYoutubeCaptions(iframe);
      }
    };

    window.addEventListener("message", onMessage);
    iframe.addEventListener("load", startPlayback);
    startPlayback();

    const retry = window.setInterval(() => {
      disableYoutubeCaptions(iframe);
    }, 400);
    const stopRetry = window.setTimeout(() => {
      window.clearInterval(retry);
    }, 4000);

    return () => {
      window.removeEventListener("message", onMessage);
      iframe.removeEventListener("load", startPlayback);
      window.clearInterval(retry);
      window.clearTimeout(stopRetry);
    };
  }, [showIframe]);

  return (
    <div
      aria-hidden={showIframe ? true : undefined}
      className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background"
    >
      {showPoster ? (
        <img
          alt={label}
          className="absolute inset-0 size-full object-contain"
          onError={() => {
            setPosterSrc(`https://i.ytimg.com/vi/${IRIS_LAUNCH_YOUTUBE_ID}/hqdefault.jpg`);
          }}
          src={posterSrc}
        />
      ) : null}
      {showIframe ? (
        <iframe
          ref={iframeRef}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          aria-hidden="true"
          className="pointer-events-none aspect-video h-[min(100%,56.25vw)] w-[min(100%,177.78vh)] border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          src={irisLaunchEmbedSrc(IRIS_LAUNCH_YOUTUBE_ID, window.location.origin)}
          tabIndex={-1}
          title={label}
        />
      ) : null}
    </div>
  );
}
