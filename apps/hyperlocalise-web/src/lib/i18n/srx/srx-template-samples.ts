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

/** Built-in SRX 2.0 templates (keep in sync with `internal/i18n/srx/templates.go`). */
export const SRX_BUILTIN_TEMPLATES = ["default", "html", "markdown"] as const;

export type SrxBuiltinTemplate = (typeof SRX_BUILTIN_TEMPLATES)[number];

export const SRX_CUSTOM_SANDBOX_FILENAME = ".hl-segmentation.srx";

export const SRX_CUSTOM_XML_PLACEHOLDER = `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0" xmlns="http://www.lisa.org/srx20">
  <body>
    <languagerules>
      <languagerule languagename="Default">
        <rule break="yes">
          <beforebreak>[\\.\\?!]+["']?</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern=".*" languagerulename="Default"/>
    </maprules>
  </body>
</srx>`;
