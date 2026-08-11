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
import { defineMessages } from "react-intl";

export const inlineCitationMessages = defineMessages({
  previousAria: {
    id: "8ibz5Pm78D",

    defaultMessage: "Previous",
    description: "Accessible label for navigating to the previous citation in a carousel",
  },
  nextAria: {
    id: "Pso/sy4WEl",

    defaultMessage: "Next",
    description: "Accessible label for navigating to the next citation in a carousel",
  },
  unknownSource: {
    defaultMessage: "Unknown",
    id: "fbw3y8puRl",
    description: "Fallback citation trigger label when no source URL is available",
  },
  additionalSources: {
    defaultMessage: "+{count}",
    id: "b07MuidGaa",
    description: "Suffix showing how many additional citation sources exist beyond the first",
  },
  carouselPage: {
    defaultMessage: "{current}/{count}",
    id: "GgAZPvlKF6",
    description: "Citation carousel page indicator showing current index and total pages",
  },
});
