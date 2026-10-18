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
import { SpeakerHighIcon, SpeakerSlashIcon } from "@phosphor-icons/react";
import { useCallback, useRef, useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { irisPageMessages } from "./iris-page.messages";
import { IrisVideoBackground, type IrisYoutubePlayerHandle } from "./iris-video-background";
import { IrisWaitlistCta } from "./iris-waitlist-cta";
import { Button } from "@/components/ui/button";

export function IrisPage() {
  const intl = useIntl();
  const playerRef = useRef<IrisYoutubePlayerHandle>(null);
  const [muted, setMuted] = useState(true);
  const [soundAvailable, setSoundAvailable] = useState(false);
  const handlePlaybackReady = useCallback(() => {
    setSoundAvailable(true);
  }, []);

  return (
    <section className="relative left-1/2 -mt-16 w-screen min-h-[100svh] -translate-x-1/2 overflow-hidden bg-background">
      <h1 className="sr-only">
        <FormattedMessage {...irisPageMessages.pageHeading} />
      </h1>
      <IrisVideoBackground onPlaybackReady={handlePlaybackReady} playerRef={playerRef} />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/50 to-transparent"
      />
      <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-center gap-3 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {soundAvailable ? (
          <Button
            aria-label={intl.formatMessage(
              muted ? irisPageMessages.unmuteVideo : irisPageMessages.muteVideo,
            )}
            aria-pressed={!muted}
            onClick={() => {
              const nextMuted = !muted;
              playerRef.current?.setMuted(nextMuted);
              setMuted(nextMuted);
            }}
            size="icon-lg"
            variant="secondary"
          >
            {muted ? <SpeakerSlashIcon /> : <SpeakerHighIcon />}
          </Button>
        ) : null}
        <IrisWaitlistCta />
      </div>
    </section>
  );
}
