import { z } from "zod";

export const taskSpecSchema = z.object({
  domain: z.enum(["translation", "repository", "provider_tms", "glossary", "project", "general"]),
  operation: z.enum(["answer", "inspect", "sync", "translate", "writeback"]),
  requiredCapabilities: z.array(z.string()).default([]),
  workspace: z.enum(["none", "repo_read"]).default("none"),
  mutationPolicy: z.enum(["none", "plan_only", "approval_required", "direct_write"]),
});

export type TaskSpec = z.infer<typeof taskSpecSchema>;
