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
import type { GoSvcRequestOptions, RenderTranslationFileBody } from "./go-svc-client.types";
import type { GoSvcRequest } from "./go-svc-request";

export class GoSvcTranslationFileApi {
  constructor(private readonly request: GoSvcRequest) {}

  /** Writes translations into a source file and returns it in the source file's format. */
  render(body: RenderTranslationFileBody, options: GoSvcRequestOptions = {}) {
    return this.request.download("/internal/translation-files/render", {
      method: "POST",
      body,
      ...options,
    });
  }
}
