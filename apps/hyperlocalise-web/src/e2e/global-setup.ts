import { execSync } from "node:child_process";
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))));
const baseUrl = "http://localhost:3000";
const port = 3000;

let serverProcess: ChildProcess | null = null;
let startedServer = false;

function isTruthyEnv(value: string | undefined) {
  return value === "1" || value === "true";
}

async function isFixtureAuthReady() {
  try {
    const response = await fetch(`${baseUrl}/e2e/login?role=admin`, {
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      return true;
    }

    if (response.status === 404) {
      throw new Error(
        "Fixture auth is disabled on the e2e server. Ensure E2E_AUTH_MODE=fixture is set.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Fixture auth is disabled")) {
      throw error;
    }
  }

  return false;
}

async function tryReuseRunningServer() {
  if (!isTruthyEnv(process.env.E2E_REUSE_SERVER)) {
    return false;
  }

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    if (!health.ok) {
      return false;
    }
  } catch {
    return false;
  }

  if (!(await isFixtureAuthReady())) {
    return false;
  }

  console.log("[e2e] Reusing server already running at", baseUrl);
  return true;
}

function findPortPids(targetPort: number): number[] {
  try {
    const output = execSync(`netstat -tlnp 2>/dev/null | grep ":${targetPort} "`, {
      encoding: "utf8",
      shell: "/bin/bash",
    });

    const pids = new Set<number>();

    for (const line of output.split("\n")) {
      const match = line.match(/LISTEN\s+(\d+)\//);
      if (match?.[1]) {
        pids.add(Number.parseInt(match[1], 10));
      }
    }

    return [...pids];
  } catch {
    return [];
  }
}

function killPort(targetPort: number) {
  for (const pid of findPortPids(targetPort)) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process may have already exited.
    }
  }

  try {
    execSync(`fuser -k ${targetPort}/tcp`, { stdio: "ignore" });
  } catch {
    // Nothing was listening on the port.
  }
}

async function waitForPortFree(targetPort: number, timeoutMs = 10_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (findPortPids(targetPort).length === 0) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Port ${targetPort} is still in use after cleanup`);
}

async function waitForServer(url: string, timeoutMs = 300_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still starting.
    }

    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `E2E server exited with code ${serverProcess.exitCode} before becoming ready`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(`Timed out waiting for e2e server at ${url}`);
}

async function waitForFixtureAuth(timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (await isFixtureAuthReady()) {
      return;
    }

    if (serverProcess && serverProcess.exitCode !== null) {
      throw new Error(
        `E2E server exited with code ${serverProcess.exitCode} before fixture auth was ready`,
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error("Timed out waiting for fixture auth endpoint");
}

function buildE2eEnv() {
  return {
    ...process.env,
    NODE_ENV: "test",
    E2E_AUTH_MODE: "fixture",
    E2E_TARGET: "local",
    E2E_BASE_URL: baseUrl,
    PORT: String(port),
    HOSTNAME: "localhost",
    DATABASE_URL:
      process.env.DATABASE_URL ??
      "postgresql://hyperlocalise:hyperlocalise@localhost:5432/hyperlocalise",
    PROVIDER_CREDENTIALS_MASTER_KEY:
      process.env.PROVIDER_CREDENTIALS_MASTER_KEY ?? "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=",
    NEXT_PUBLIC_WAITLIST_URL:
      process.env.NEXT_PUBLIC_WAITLIST_URL ?? "https://example.com/waitlist",
    WORKOS_API_KEY: process.env.WORKOS_API_KEY ?? "test-workos-api-key",
    WORKOS_CLIENT_ID: process.env.WORKOS_CLIENT_ID ?? "client_test",
    WORKOS_REDIRECT_URI: process.env.WORKOS_REDIRECT_URI ?? "http://localhost:3000/auth/callback",
    NEXT_PUBLIC_WORKOS_REDIRECT_URI:
      process.env.NEXT_PUBLIC_WORKOS_REDIRECT_URI ?? "http://localhost:3000/auth/callback",
    WORKOS_COOKIE_PASSWORD:
      process.env.WORKOS_COOKIE_PASSWORD ?? "this-is-a-test-cookie-password-at-least-32-characters",
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? "test-openai-api-key",
    AUTUMN_API_KEY: process.env.AUTUMN_API_KEY ?? "am_sk_test_placeholder",
  };
}

async function runCommand(command: string, args: string[], env: NodeJS.ProcessEnv) {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: rootDir,
      env,
      stdio: "inherit",
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} failed with exit code ${code ?? "unknown"}`));
    });
  });
}

export default async function setup() {
  if (process.env.E2E_TARGET === "staging") {
    const externalBaseUrl = process.env.E2E_BASE_URL ?? baseUrl;
    await waitForServer(`${externalBaseUrl}/api/health`);
    return;
  }

  if (await tryReuseRunningServer()) {
    return;
  }

  const env = buildE2eEnv();

  if (!isTruthyEnv(process.env.E2E_SKIP_MIGRATE)) {
    await runCommand("vp", ["run", "db:migrate"], env);
  }

  const buildOutputExists = existsSync(path.join(rootDir, ".next", "BUILD_ID"));
  const shouldBuild =
    !isTruthyEnv(process.env.E2E_SKIP_BUILD) &&
    (!buildOutputExists || isTruthyEnv(process.env.E2E_FORCE_BUILD));

  if (shouldBuild) {
    await runCommand("vp", ["run", "build"], env);
  } else {
    console.log("[e2e] Skipping production build (set E2E_FORCE_BUILD=1 to rebuild)");
  }

  killPort(port);
  await waitForPortFree(port);

  serverProcess = spawn("vp", ["run", "start", "--port", String(port), "--hostname", "localhost"], {
    cwd: rootDir,
    env,
    stdio: "inherit",
  });
  startedServer = true;

  serverProcess.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`E2E server exited unexpectedly with code ${code}`);
    }
  });

  await waitForServer(`${baseUrl}/api/health`);
  await waitForFixtureAuth();
}

export async function teardown() {
  if (!startedServer || !serverProcess || serverProcess.killed) {
    return;
  }

  serverProcess.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    serverProcess?.on("exit", () => resolve());
    setTimeout(() => resolve(), 5_000);
  });

  killPort(port);
  serverProcess = null;
}
