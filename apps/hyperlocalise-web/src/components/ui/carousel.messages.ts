"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in the LICENSE file and at https://mariadb.com/bsl11/.
 *
 * Change Date: Four years from the date the Licensed Work is published.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { defineMessages } from "react-intl";

export const carouselMessages = defineMessages({
  regionRoleDescription: {
    defaultMessage: "carousel",
    id: "2BjCOKp1Qt",
    description: "Accessible role description for the carousel region",
  },
  slideRoleDescription: {
    defaultMessage: "slide",
    id: "fzSGIYfOgO",
    description: "Accessible role description for an individual carousel slide",
  },
  previousSlide: {
    defaultMessage: "Previous slide",
    id: "LeSdkdB/lW",
    description: "Accessible label for the carousel previous-slide control",
  },
  nextSlide: {
    defaultMessage: "Next slide",
    id: "1fSQakBNGg",
    description: "Accessible label for the carousel next-slide control",
  },
});
