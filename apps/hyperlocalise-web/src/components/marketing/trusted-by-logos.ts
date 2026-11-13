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
import type { MessageDescriptor } from "react-intl";

import { heroSectionMessages } from "./hero-section.messages";

export type TrustedByLogo = {
  id: string;
  href: string;
  src: string;
  alt: MessageDescriptor;
  width: number;
  height: number;
  className: string;
};

export const TRUSTED_BY_LOGOS: TrustedByLogo[] = [
  {
    id: "heidi-health",
    href: "https://www.heidihealth.com",
    src: "/images/customers/heidi-health-logo.png",
    alt: heroSectionMessages.heidiHealthAlt,
    width: 800,
    height: 332,
    className: "h-7 sm:h-8",
  },
  {
    id: "tourfinder",
    href: "https://tourfinder.vn",
    src: "/images/customers/tourfinder-logo.png",
    alt: heroSectionMessages.tourfinderAlt,
    width: 1177,
    height: 294,
    className: "h-6 sm:h-7",
  },
  {
    id: "wall-st-rank",
    href: "https://www.wallstrank.com",
    src: "/images/customers/wall-st-rank-logo.svg",
    alt: heroSectionMessages.wallStRankAlt,
    width: 3044,
    height: 600,
    className: "h-6 max-w-[8.5rem] sm:h-7 sm:max-w-[10rem]",
  },
  {
    id: "weex",
    href: "https://www.weex.com",
    src: "/images/customers/weex-logo.svg",
    alt: heroSectionMessages.weexAlt,
    width: 134,
    height: 28,
    className: "h-6 sm:h-7",
  },
];
