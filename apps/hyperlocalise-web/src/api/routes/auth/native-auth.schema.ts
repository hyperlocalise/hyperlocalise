import { z } from "zod";

/** AuthKit redirect for native clients: custom scheme or http(s) loopback. */
const nativeRedirectUriSchema = z
  .string()
  .min(1)
  .max(512)
  .refine((value) => value.startsWith("hyperlocalise://") || /^https?:\/\//i.test(value), {
    message: "invalid_native_redirect_uri",
  });

export const nativeAuthorizeQuerySchema = z.object({
  codeChallenge: z.string().min(43).max(128),
  codeChallengeMethod: z.literal("S256").default("S256"),
  redirectUri: nativeRedirectUriSchema,
  state: z.string().min(8).max(256).optional(),
  screenHint: z.enum(["sign-in", "sign-up"]).optional(),
});

export const nativeTokenBodySchema = z.object({
  code: z.string().min(1),
  codeVerifier: z.string().min(43).max(128),
  redirectUri: nativeRedirectUriSchema,
});

export type NativeAuthorizeQuery = z.infer<typeof nativeAuthorizeQuerySchema>;
export type NativeTokenBody = z.infer<typeof nativeTokenBodySchema>;
