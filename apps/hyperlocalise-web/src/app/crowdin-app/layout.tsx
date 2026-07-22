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
import type { ReactNode } from "react";

import "./crowdin-app.css";

export const metadata = {
  title: "Hyperlocalise",
  robots: {
    index: false,
    follow: false,
  },
};

export default function CrowdinAppLayout({ children }: { children: ReactNode }) {
  return (
    <div data-crowdin-app className="crowdin-app-root min-h-svh bg-background text-foreground">
      {children}
    </div>
  );
}
