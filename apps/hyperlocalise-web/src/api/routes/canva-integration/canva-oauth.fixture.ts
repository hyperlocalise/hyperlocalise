import { inArray } from "drizzle-orm";

import {
  generateCanvaOAuthToken,
  getCanvaOAuthTokenExpiry,
  hashCanvaOAuthToken,
} from "@/api/auth/canva-oauth";
import { db, schema } from "@/lib/database";

export async function createCanvaOAuthTestSession(input: {
  userId: string;
  canvaBrandId?: string;
}) {
  const accessToken = generateCanvaOAuthToken();
  const refreshToken = generateCanvaOAuthToken();
  const { accessTokenExpiresAt, refreshTokenExpiresAt } = getCanvaOAuthTokenExpiry();

  const [session] = await db
    .insert(schema.canvaOauthSessions)
    .values({
      userId: input.userId,
      accessTokenHash: hashCanvaOAuthToken(accessToken),
      refreshTokenHash: hashCanvaOAuthToken(refreshToken),
      canvaBrandId: input.canvaBrandId ?? null,
      expiresAt: accessTokenExpiresAt,
      refreshExpiresAt: refreshTokenExpiresAt,
    })
    .returning({ id: schema.canvaOauthSessions.id });

  return {
    accessToken,
    refreshToken,
    sessionId: session.id,
  };
}

export async function cleanupCanvaOAuthTestSessions(userIds: string[]) {
  if (userIds.length === 0) {
    return;
  }

  await db
    .delete(schema.canvaOauthSessions)
    .where(inArray(schema.canvaOauthSessions.userId, userIds));
}
