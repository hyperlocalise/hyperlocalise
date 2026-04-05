import { Inngest } from "inngest";

export function createInngestClient() {
  return new Inngest({
    id: "hyperlocalise-web",
    eventKey: process.env.INNGEST_EVENT_KEY,
    baseUrl: process.env.INNGEST_BASE_URL,
  });
}

export const inngestClient = createInngestClient();
