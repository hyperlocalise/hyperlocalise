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
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vite-plus/test";

import { PRICING_IRIS_MODELS } from "./pricing-iris-models";

const GO_REGISTRY_PATH = fileURLToPath(
  new URL("../../../../../go-svc/iris-generation-models.go", import.meta.url),
);

function readGoRegistry(): { id: string; name: string }[] {
  const source = readFileSync(GO_REGISTRY_PATH, "utf8");
  return [...source.matchAll(/\{ID: "([^"]+)", Name: "([^"]+)"/g)].map(([, id, name]) => ({
    id: id ?? "",
    name: name ?? "",
  }));
}

describe("pricing Iris models", () => {
  it("matches the go-svc Iris registry, id for id and name for name", () => {
    const registry = readGoRegistry();

    expect(registry.length).toBeGreaterThan(0);
    expect(PRICING_IRIS_MODELS.map(({ id, name }) => ({ id, name }))).toEqual(registry);
  });
});
