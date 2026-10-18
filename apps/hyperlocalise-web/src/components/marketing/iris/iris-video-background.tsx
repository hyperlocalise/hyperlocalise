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
import { useEffect, useState } from "react";
import { useIntl } from "react-intl";

import { irisPageMessages } from "./iris-page.messages";
import {
  IRIS_LAUNCH_YOUTUBE_ID,
  irisLaunchEmbedSrc,
  irisLaunchPosterSrc,
} from "@/lib/iris/iris-waitlist";

export function IrisVideoBackground() {
  const intl = useIntl();
  const shouldReduceMotion = useReducedMotion();
  const [motionPreferenceReady, setMotionPreferenceReady] = useState(false);
  const [posterSrc, setPosterSrc] = useState(irisLaunchPosterSrc);
  const label = intl.formatMessage(irisPageMessages.videoLabel);
  const showIframe = motionPreferenceReady && shouldReduceMotion === false;

  useEffect(() => {
    setMotionPreferenceReady(true);
  }, []);

  return (
    <div aria-hidden={showIframe ? true : undefined} className="absolute inset-0">
      <img
        alt={showIframe ? "" : label}
        className="absolute inset-0 size-full object-cover"
        onError={() => {
          setPosterSrc(`https://i.ytimg.com/vi/${IRIS_LAUNCH_YOUTUBE_ID}/hqdefault.jpg`);
        }}
        src={posterSrc}
      />
      {showIframe ? (
        <iframe
          allow="autoplay; encrypted-media; picture-in-picture"
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-1/2 h-[56.25vw] min-h-full w-[177.78vh] min-w-full -translate-x-1/2 -translate-y-1/2 border-0"
          src={irisLaunchEmbedSrc()}
          tabIndex={-1}
          title={label}
        />
      ) : null}
    </div>
  );
}
