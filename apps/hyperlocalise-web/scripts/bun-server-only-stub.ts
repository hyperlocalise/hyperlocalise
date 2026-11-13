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
/**
 * Preload for Bun scripts that import server modules (for example the database client): the
 * `server-only` marker throws outside a React server build, so it is replaced with an empty module.
 */
type BunPluginBuilder = {
  module: (
    name: string,
    load: () => { exports: Record<string, unknown>; loader: "object" },
  ) => void;
};
const bun = (
  globalThis as {
    Bun?: { plugin: (plugin: { name: string; setup: (build: BunPluginBuilder) => void }) => void };
  }
).Bun;

bun?.plugin({
  name: "server-only-stub",
  setup(build) {
    build.module("server-only", () => ({ exports: {}, loader: "object" }));
  },
});
