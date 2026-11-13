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
import { useEffect, useState } from "react";
import { PlayIcon } from "@phosphor-icons/react/ssr";
import { useReducedMotion } from "motion/react";
import { useIntl } from "react-intl";

import { irisLaunchEmbedSrc, irisLaunchPosterSrc } from "@/lib/iris/iris-waitlist";

import { updateAnnouncerMessages } from "./update-announcer.messages";

export const GUIDELINE_LAUNCH_YOUTUBE_ID = "t4VI_etAQac";
export const GUIDELINE_LAUNCH_YOUTUBE_WATCH_URL = `https://www.youtube.com/watch?v=${GUIDELINE_LAUNCH_YOUTUBE_ID}`;

/** Muted looping Guidelines film for the product update card. Falls back to a poster when motion is reduced. */
export function GuidelinesPreview() {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();
  const [motionPreferenceReady, setMotionPreferenceReady] = useState(false);
  const [posterSrc, setPosterSrc] = useState(() =>
    irisLaunchPosterSrc(GUIDELINE_LAUNCH_YOUTUBE_ID),
  );
  const label = intl.formatMessage(updateAnnouncerMessages.guidelinesFilmLabel);
  const showIframe = motionPreferenceReady && shouldReduceMotion === false;
  const showPoster = motionPreferenceReady && shouldReduceMotion === true;

  useEffect(() => {
    setMotionPreferenceReady(true);
  }, []);

  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden">
      {showPoster ? (
        <>
          <img
            alt=""
            className="absolute inset-0 size-full object-cover"
            onError={() => {
              setPosterSrc(`https://i.ytimg.com/vi/${GUIDELINE_LAUNCH_YOUTUBE_ID}/hqdefault.jpg`);
            }}
            src={posterSrc}
          />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-background/90 text-foreground shadow-lg ring-1 ring-black/10">
              <PlayIcon className="size-5" weight="fill" />
            </span>
          </span>
        </>
      ) : null}
      {showIframe ? (
        <iframe
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          className="pointer-events-none absolute inset-0 size-full border-0"
          referrerPolicy="strict-origin-when-cross-origin"
          src={irisLaunchEmbedSrc(GUIDELINE_LAUNCH_YOUTUBE_ID, window.location.origin)}
          tabIndex={-1}
          title={label}
        />
      ) : null}
    </div>
  );
}
