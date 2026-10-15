"use client";

import { useEffect, useState } from "react";

const FIGMA_OAUTH_MESSAGE_TYPE = "hyperlocalise-figma-oauth";

export default function FigmaOAuthCallbackPage() {
  const [detail, setDetail] = useState("Completing sign-in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const state = params.get("state") ?? "";
    const code = params.get("code") ?? undefined;
    const error = params.get("error") ?? undefined;
    const errorDescription = params.get("error_description") ?? undefined;

    if (window.opener) {
      window.opener.postMessage(
        {
          type: FIGMA_OAUTH_MESSAGE_TYPE,
          state,
          code,
          error,
          errorDescription,
        },
        window.location.origin,
      );
    }

    if (error) {
      setDetail(errorDescription ?? error);
      return;
    }
    if (code) {
      setDetail("Connected. You can close this window and return to Figma.");
      return;
    }
    setDetail("Missing authorization response. Close this window and try again.");
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "28rem" }}>
      <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Hyperlocalise</h1>
      <p style={{ marginTop: "0.75rem", lineHeight: 1.5 }}>{detail}</p>
    </main>
  );
}
