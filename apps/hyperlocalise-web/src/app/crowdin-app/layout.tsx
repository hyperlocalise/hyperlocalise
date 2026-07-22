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
