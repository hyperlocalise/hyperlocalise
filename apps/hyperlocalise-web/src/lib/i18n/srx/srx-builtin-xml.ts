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

import type { SrxBuiltinTemplate } from "@/lib/i18n/srx/srx-template-samples";

/** Built-in SRX XML (keep in sync with `internal/i18n/srx/templates.go`). */
export const SRX_BUILTIN_XML: Record<SrxBuiltinTemplate, string> = {
  default: `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
  <body>
    <languagerules>
      <languagerule languagename="Default">
        <rule break="no">
          <beforebreak>(?i)(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\\.g|i\\.e)\\.</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\\d\\.</beforebreak>
          <afterbreak>\\d</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\\.!\\?]+["']?</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern=".*" languagerulename="Default"/>
    </maprules>
  </body>
</srx>`,
  html: `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
  <body>
    <languagerules>
      <languagerule languagename="HTML">
        <rule break="no">
          <beforebreak>(?i)(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\\.g|i\\.e)\\.</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>(?i)(www|https?)</beforebreak>
          <afterbreak>:</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\\d\\.</beforebreak>
          <afterbreak>\\d</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\\.!\\?]+["']?</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern=".*" languagerulename="HTML"/>
    </maprules>
  </body>
</srx>`,
  markdown: `<?xml version="1.0" encoding="UTF-8"?>
<srx version="2.0">
  <body>
    <languagerules>
      <languagerule languagename="Markdown">
        <rule break="no">
          <beforebreak>(?i)(Mr|Mrs|Ms|Dr|Prof|Sr|Jr|vs|etc|e\\.g|i\\.e)\\.</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\\d+\\.</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
        <rule break="no">
          <beforebreak>\\d\\.</beforebreak>
          <afterbreak>\\d</afterbreak>
        </rule>
        <rule break="yes">
          <beforebreak>[\\.!\\?]+["']?</beforebreak>
          <afterbreak>\\s</afterbreak>
        </rule>
      </languagerule>
    </languagerules>
    <maprules>
      <languagemap languagepattern=".*" languagerulename="Markdown"/>
    </maprules>
  </body>
</srx>`,
};
