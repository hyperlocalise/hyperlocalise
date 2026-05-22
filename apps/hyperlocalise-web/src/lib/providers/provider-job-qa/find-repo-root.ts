import { access } from "node:fs/promises";
import path from "node:path";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function findMonorepoRoot(startDir = process.cwd()): Promise<string> {
  let current = path.resolve(startDir);
  while (true) {
    const goMod = path.join(current, "go.mod");
    const cliDir = path.join(current, "apps", "cli");
    if ((await pathExists(goMod)) && (await pathExists(cliDir))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  throw new Error("Could not locate hyperlocalise monorepo root (go.mod + apps/cli)");
}
