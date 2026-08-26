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
import { describe, expect, it, vi } from "vite-plus/test";
import { renderToStaticMarkup } from "react-dom/server";

const dynamicOptions = vi.hoisted(() => ({ ssr: undefined as boolean | undefined }));

vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, options: { loading?: () => React.ReactNode; ssr?: boolean }) => {
    dynamicOptions.ssr = options.ssr;
    return options.loading ?? (() => null);
  },
}));

import { HeroFrameLoadingShell } from "./hero-frame-mesh-stage";

describe("HeroFrameMeshStage", () => {
  it("keeps the browser-dependent CAT workspace out of server rendering", () => {
    expect(dynamicOptions.ssr).toBe(false);
  });

  it("reserves the CAT workspace height while the client bundle loads", () => {
    const markup = renderToStaticMarkup(<HeroFrameLoadingShell />);

    expect(markup).toContain("h-[min(42rem,78svh)]");
    expect(markup).toContain("min-h-136");
    expect(markup).toContain('aria-hidden="true"');
  });
});
