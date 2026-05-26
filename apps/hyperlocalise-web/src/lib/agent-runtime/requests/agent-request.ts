import { z } from "zod";

export const agentRequestSourceSchema = z.enum(["slack", "github", "chat_ui", "email"]);
export type AgentRequestSource = z.infer<typeof agentRequestSourceSchema>;

export const agentActorSchema = z.object({
  sourceUserId: z.string(),
  userId: z.string().optional(),
  email: z.string().optional(),
  displayName: z.string().optional(),
  role: z.enum(["owner", "admin", "member"]).optional(),
});
export type AgentActor = z.infer<typeof agentActorSchema>;

export const agentRequestSchema = z.object({
  id: z.string(),
  source: agentRequestSourceSchema,
  organizationId: z.string(),
  projectId: z.string().nullable(),
  actor: agentActorSchema,
  sourceThreadId: z.string(),
  input: z.object({
    text: z.string(),
  }),
  idempotencyKey: z.string(),
  responsePolicy: z.object({
    type: z.enum(["stream", "thread_reply", "email_reply", "webhook_comment"]),
  }),
});

export type AgentRequest = z.infer<typeof agentRequestSchema>;
