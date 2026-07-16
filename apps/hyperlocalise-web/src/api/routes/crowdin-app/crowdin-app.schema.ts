import { z } from "zod";

export const crowdinAppSessionBodySchema = z.object({
  jwtToken: z.string().min(1),
});

export const crowdinAppInstalledBodySchema = z.object({
  appId: z.string().min(1),
  appSecret: z.string().min(1),
  domain: z.string().nullable().optional(),
  organizationId: z.union([z.number().int().positive(), z.string().min(1)]),
  userId: z.union([z.number().int().positive(), z.string().min(1)]),
  baseUrl: z.string().url(),
});

export const crowdinAppUninstallBodySchema = z.object({
  domain: z.string().nullable().optional(),
  organizationId: z.union([z.number().int().positive(), z.string().min(1)]),
});
