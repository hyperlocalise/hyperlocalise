import { assertPublicHttpUrlResolvable } from "@/lib/security/ssrf-guard";

export async function providerSafeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  await assertPublicHttpUrlResolvable(url);
  return fetch(input, {
    ...init,
    redirect: "error",
  });
}
