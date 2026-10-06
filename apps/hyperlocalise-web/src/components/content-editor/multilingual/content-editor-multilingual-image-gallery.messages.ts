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

export const multilingualImageGalleryMessages = defineMessages({
  title: {
    defaultMessage: "Localised images",
    id: "2s0wgfJqtI",
    description: "Accessible label for the gallery of an image file across every language",
  },
  hint: {
    defaultMessage: "Compare the original image with every localised version.",
    id: "eAYfqN3OZW",
    description: "Hint above the multilingual image gallery",
  },
  original: {
    defaultMessage: "Original",
    id: "pIhCSFb9aQ",
    description: "Badge on the gallery card that shows the source image",
  },
  missing: {
    defaultMessage: "Not localised yet",
    id: "3wYfj4Aoza",
    description: "Placeholder on a gallery card when a language has no localised image",
  },
  generate: {
    defaultMessage: "Localise",
    id: "0T6JuSobQg",
    description: "Button that generates the localised image for one language in the gallery",
  },
  regenerate: {
    defaultMessage: "Regenerate",
    id: "6iDbMTqADs",
    description: "Button that regenerates the localised image for one language in the gallery",
  },
  generateAria: {
    defaultMessage: "Localise image for {language}",
    id: "s5MXE6Sf9S",
    description: "Accessible label for the per-language localise button in the gallery",
  },
  regenerateAria: {
    defaultMessage: "Regenerate image for {language}",
    id: "OaljrNEvvO",
    description: "Accessible label for the per-language regenerate button in the gallery",
  },
  open: {
    defaultMessage: "Open",
    id: "1NT4ECW8F7",
    description: "Button that opens one language's image in the image editor",
  },
  openAria: {
    defaultMessage: "Open {language} image in the editor",
    id: "lNwBXN2jgg",
    description: "Accessible label for the per-language open button in the gallery",
  },
  generationError: {
    defaultMessage: "Could not localise this image. Try again.",
    id: "cBFV4P0+Px",
    description: "Error on a gallery card when generating that language's image failed",
  },
  imageAlt: {
    defaultMessage: "{language} image",
    id: "bxqFrap668",
    description: "Alt text for an image in the multilingual image gallery",
  },
  generatingCount: {
    defaultMessage: "{count, plural, one {Localising # image…} other {Localising # images…}}",
    id: "S3lxqQnnh1",
    description: "Status in the gallery footer while images are being generated",
  },
});
