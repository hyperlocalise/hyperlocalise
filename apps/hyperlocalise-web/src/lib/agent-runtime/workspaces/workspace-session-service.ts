import type { WorkspaceLifecyclePolicy, WorkspaceRuntime } from "./types";
import { createVercelSandboxWorkspace } from "./vercel-sandbox-runtime";

export type WorkspaceSession = {
  id: string;
  lifecyclePolicy: WorkspaceLifecyclePolicy;
  runtime: WorkspaceRuntime;
};

export async function createDisposableRepoWorkspaceSession(input: {
  source: {
    url: string;
    revision: string;
    username?: string;
    password?: string;
  };
  timeoutMs?: number;
}): Promise<WorkspaceSession> {
  const runtime = await createVercelSandboxWorkspace({
    source: {
      type: "git",
      url: input.source.url,
      revision: input.source.revision,
      depth: 1,
      username: input.source.username,
      password: input.source.password,
    },
    timeoutMs: input.timeoutMs,
  });
  return {
    id: runtime.id,
    lifecyclePolicy: {
      mode: "disposable",
      timeoutMs: input.timeoutMs ?? 10 * 60 * 1000,
      destroyOnFinish: true,
    },
    runtime,
  };
}
