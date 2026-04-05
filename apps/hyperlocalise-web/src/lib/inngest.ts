import { Inngest } from "inngest";

import { env } from "@/lib/env";

export const inngest = new Inngest({
  id: "hyperlocalise-web",
  eventKey: env.INNGEST_EVENT_KEY,
});

export const functions = [];
