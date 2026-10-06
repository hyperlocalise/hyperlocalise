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

export const imageGenerationLoadingCardMessages = defineMessages({
  label: {
    defaultMessage: "Generating image",
    id: "deFqHCU5Q7",
    description: "Accessible label for the animated card shown while an image is being generated",
  },
  dimensions: {
    defaultMessage: "{width} × {height}",
    id: "rqmhfb50Yj",
    description:
      "Pixel dimensions of the image being generated, shown on the generation loading card",
  },
});
