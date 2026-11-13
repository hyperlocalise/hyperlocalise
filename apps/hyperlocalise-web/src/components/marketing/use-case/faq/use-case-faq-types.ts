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
import type { MessageDescriptor } from "@formatjs/intl";

export type UseCaseFaqSlug =
  | "localisation-operations"
  | "localisation-quality-monitoring"
  | "help-center-localisation"
  | "market-entry"
  | "marketing-localisation"
  | "market-experimentation"
  | "github-release-localisation"
  | "localisation-cli-and-api"
  | "localisation-for-ai-coding-agents";

export type UseCaseFaqDescriptor = {
  question: MessageDescriptor;
  answer: MessageDescriptor;
};

export type UseCaseFaqSectionCopy = {
  heading: MessageDescriptor;
  subheading: MessageDescriptor;
};
