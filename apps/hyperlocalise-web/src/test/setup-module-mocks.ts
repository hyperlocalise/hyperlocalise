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
import { afterAll, vi } from "vite-plus/test";

// Tests run with `isolate: false`, so every file in a worker shares one module
// graph. Vitest scopes `vi.mock` registrations to the registering file, but
// modules evaluated against a mock stay cached, and modules cached before a
// file registers a mock never see it. This resets only the importers of
// mocked modules, before the mock is used and again when the file finishes.
//
// Relies on Vitest internals (`__vitest_mocker__` and the module runner's
// evaluated module graph). Re-check after upgrading Vitest.

// Setup files are re-evaluated for every test file, so state lives on the
// worker's mocker instead of in this module.
const MOCKED_IDS_KEY = Symbol.for("hyperlocalise.test.mockedModuleIds");

type ModuleNode = {
  evaluated: boolean;
  promise?: Promise<unknown>;
  exports?: unknown;
  importers: Set<string>;
};

type EvaluatedModules = {
  getModuleById(id: string): ModuleNode | undefined;
  fileToModulesMap: Map<string, Set<ModuleNode>>;
  invalidateModule(node: ModuleNode): void;
};

type MockPath = (originalId: string, id: string, ...rest: unknown[]) => void;

type Mocker = {
  readonly evaluatedModules: EvaluatedModules;
  getMockPath(id: string): string;
  mockPath: MockPath;
  unmockPath(id: string): void;
  reset(): void;
  [MOCKED_IDS_KEY]?: Set<string>;
};

const mocker = (globalThis as { __vitest_mocker__?: Mocker }).__vitest_mocker__;

if (mocker) {
  const mockedIds = trackMockedModules(mocker);

  afterAll(() => {
    const modules = mocker.evaluatedModules;
    if (mockedIds.size > 0) {
      const roots = [...mockedIds].flatMap((id) => findModules(modules, id));
      for (const id of mockedIds) {
        const mockNode = modules.getModuleById(mocker.getMockPath(id));
        if (mockNode) modules.invalidateModule(mockNode);
      }
      resetImporters(modules, roots);
      for (const node of roots) modules.invalidateModule(node);
      mockedIds.clear();
      mocker.reset();
    }

    // Incomplete `@/lib/log` or live WorkOS env mocks can survive into the next
    // file when isolate is false. Always drop these shared singletons.
    resetModulesMatching(modules, (file) =>
      [
        "/src/lib/log.ts",
        "/src/lib/env.ts",
        "/src/lib/workos/server-client.ts",
        "/src/api/auth/workos-membership-reconcile.ts",
        "/src/lib/memory/memory-entry-lifecycle.ts",
        "/src/lib/projects/project-service-base.ts",
      ].some((suffix) => file.endsWith(suffix)),
    );

    dropDisconnectedDatabase();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
}

// The database client keeps `db` on globalThis and reuses it when the module is
// evaluated again. Evaluated under an `@/lib/env` mock with no DATABASE_URL,
// it stores a `db` with no connection, which every later file in the worker
// would get. Dropping it lets the next evaluation build a connected one.
function dropDisconnectedDatabase() {
  const globalForDb = globalThis as { db?: { $client?: unknown } };
  if (globalForDb.db && !globalForDb.db.$client) delete globalForDb.db;
}

function trackMockedModules(target: Mocker): Set<string> {
  const existing = target[MOCKED_IDS_KEY];
  if (existing) return existing;

  const mockedIds = new Set<string>();
  target[MOCKED_IDS_KEY] = mockedIds;

  const mockPath = target.mockPath.bind(target);
  const unmockPath = target.unmockPath.bind(target);

  target.mockPath = (originalId, id, ...rest) => {
    mockPath(originalId, id, ...rest);
    mockedIds.add(id);
    resetImporters(target.evaluatedModules, findModules(target.evaluatedModules, id));
  };
  target.unmockPath = (id) => {
    unmockPath(id);
    mockedIds.add(id);
    resetImporters(target.evaluatedModules, findModules(target.evaluatedModules, id));
  };

  return mockedIds;
}

function resetModulesMatching(modules: EvaluatedModules, predicate: (file: string) => boolean) {
  const roots: ModuleNode[] = [];
  for (const [file, nodes] of modules.fileToModulesMap) {
    if (predicate(file)) {
      roots.push(...nodes);
    }
  }
  if (roots.length === 0) {
    return;
  }
  resetImporters(modules, roots);
  for (const node of roots) {
    modules.invalidateModule(node);
  }
}

function findModules(modules: EvaluatedModules, id: string): ModuleNode[] {
  const nodes = new Set(modules.fileToModulesMap.get(id));
  const node = modules.getModuleById(id);
  if (node) nodes.add(node);
  return [...nodes];
}

// Keeps each node's fetched `meta` so this is safe to call while the module
// runner is fetching, and so re-evaluation does not re-transform the source.
function resetImporters(modules: EvaluatedModules, roots: ModuleNode[]) {
  const visited = new Set<string>();
  const pending = roots.flatMap((node) => [...node.importers]);

  while (pending.length > 0) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = modules.getModuleById(id);
    // A pending promise means the module is mid-evaluation in the current import chain.
    if (!node || (node.promise && !node.evaluated)) continue;

    node.evaluated = false;
    node.promise = undefined;
    node.exports = undefined;
    pending.push(...node.importers);
  }
}
