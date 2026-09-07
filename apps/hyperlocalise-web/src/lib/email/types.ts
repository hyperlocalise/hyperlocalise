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
import type { PipesConnectionStatus } from "@/lib/pipes/types";

import type { EmailProviderSlug } from "./constants";

export type EmailPipesConnectionStatus = PipesConnectionStatus;

export type EmailPipesError =
  | { code: "email_pipes_unavailable"; message: string }
  | { code: "email_provider_not_connected"; message: string }
  | { code: "email_pipes_needs_reauthorization"; message: string };

export type EmailSendError = {
  code: "email_send_failed";
  message: string;
};

export type TransactionalEmailInput = {
  provider: EmailProviderSlug;
  apiKey: string;
  from: string;
  recipients: string[];
  subject: string;
  message: string;
};
