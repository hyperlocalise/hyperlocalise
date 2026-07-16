import { createHmac } from "node:crypto";
import { describe, expect, it } from "vite-plus/test";

import { env } from "@/lib/env";

import { verifyCrowdinAppEventSignature } from "./event-signature";

describe("verifyCrowdinAppEventSignature", () => {
  it("accepts a valid content checksum", () => {
    const rawBody = JSON.stringify({ organizationId: 1, userId: 2 });
    const checksum = createHmac("sha256", env.CROWDIN_APP_CLIENT_SECRET!)
      .update(rawBody, "utf8")
      .digest("hex");

    expect(
      verifyCrowdinAppEventSignature({
        rawBody,
        contentChecksumHeader: checksum,
      }),
    ).toEqual({ ok: true });
  });

  it("rejects missing and invalid signatures", () => {
    expect(
      verifyCrowdinAppEventSignature({
        rawBody: "{}",
        contentChecksumHeader: null,
      }),
    ).toEqual({ error: "crowdin_event_signature_missing" });

    expect(
      verifyCrowdinAppEventSignature({
        rawBody: "{}",
        contentChecksumHeader: "deadbeef",
      }),
    ).toEqual({ error: "crowdin_event_signature_invalid" });
  });
});
