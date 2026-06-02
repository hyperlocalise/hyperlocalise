import { Sandbox } from "@vercel/sandbox";

export const defaultVercelSandboxRuntime = "node26" as const;

type VercelSandboxCreateOptions = Parameters<typeof Sandbox.create>[0];

const installRequiredSandboxToolsCommand = [
  "if command -v rg >/dev/null 2>&1; then exit 0; fi",
  "if command -v apt-get >/dev/null 2>&1; then",
  "  apt-get update && apt-get install -y ripgrep",
  "elif command -v dnf >/dev/null 2>&1; then",
  "  dnf install -y ripgrep",
  "else",
  '  echo "No supported package manager found for installing ripgrep." >&2',
  "  exit 1",
  "fi",
  "command -v rg >/dev/null 2>&1",
].join("\n");

export async function createConfiguredVercelSandbox(
  options: VercelSandboxCreateOptions = {},
): Promise<Sandbox> {
  const sandbox = await Sandbox.create({
    runtime: defaultVercelSandboxRuntime,
    ...options,
  });

  const installResult = await sandbox.runCommand({
    cmd: "sh",
    args: ["-c", installRequiredSandboxToolsCommand],
    sudo: true,
  });
  if (installResult.exitCode !== 0) {
    throw new Error(`sandbox tool installation failed: ${await installResult.output("both")}`);
  }

  return sandbox;
}
