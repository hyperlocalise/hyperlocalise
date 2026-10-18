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

export const IRIS_WAITLIST_FORM_ID = "EkDRAB";
export const IRIS_WAITLIST_URL = `https://tally.so/r/${IRIS_WAITLIST_FORM_ID}`;
export const IRIS_LAUNCH_YOUTUBE_ID = "oqTAEcsVFa0";

export function irisLaunchPosterSrc(videoId = IRIS_LAUNCH_YOUTUBE_ID) {
  return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

export function irisLaunchEmbedSrc(videoId = IRIS_LAUNCH_YOUTUBE_ID, origin?: string) {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    playsinline: "1",
    loop: "1",
    playlist: videoId,
    modestbranding: "1",
    rel: "0",
    showinfo: "0",
    iv_load_policy: "3",
    disablekb: "1",
    fs: "0",
    cc_load_policy: "0",
    enablejsapi: "1",
  });

  if (origin) {
    params.set("origin", origin);
  }

  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}
