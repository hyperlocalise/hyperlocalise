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
import { initBotId } from "botid/client/core";
import posthog from "posthog-js";

import {
  POSTHOG_INGEST_PATH,
  posthogProjectToken,
  posthogUiHost,
} from "@/lib/analytics/posthog-config";

const posthogToken = posthogProjectToken();
if (posthogToken) {
  posthog.init(posthogToken, {
    api_host: POSTHOG_INGEST_PATH,
    ui_host: posthogUiHost(),
    defaults: "2026-08-30",
    autocapture: false,
    capture_exceptions: false,
    disable_session_recording: true,
    person_profiles: "identified_only",
  });
}

initBotId({
  protect: [
    {
      path: "/api/localisation-audit",
      method: "POST",
    },
    {
      path: "/api/localisation-audit/*/unlock",
      method: "POST",
    },
    {
      path: "/api/public/web-chat/*/*/messages",
      method: "POST",
    },
    {
      path: "/api/public/web-chat/*/*/conversations/*/chat",
      method: "POST",
    },
  ],
});
