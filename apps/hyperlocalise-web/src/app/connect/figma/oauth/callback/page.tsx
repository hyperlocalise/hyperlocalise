"use client";

import { useEffect, useState } from "react";

export default function FigmaOAuthCallbackPage() {
  const [detail, setDetail] = useState("Completing sign-in…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const writeKey = params.get("state") ?? "";
    const code = params.get("code") ?? undefined;
    const error = params.get("error") ?? undefined;
    const errorDescription = params.get("error_description") ?? undefined;

    const completeHandoff = async () => {
      if (!writeKey) {
        setDetail("Missing authorization response. Close this window and try again.");
        return;
      }

      try {
        const response = await fetch("/api/oauth/figma/handoff/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            writeKey,
            code,
            error,
            errorDescription,
          }),
        });
        if (!response.ok) {
          setDetail("Could not finish sign-in. Close this window and try again in Figma.");
          return;
        }
      } catch {
        setDetail("Could not finish sign-in. Close this window and try again in Figma.");
        return;
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
    };

    void completeHandoff();
  }, []);

  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: "28rem" }}>
      <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Hyperlocalise</h1>
      <p style={{ marginTop: "0.75rem", lineHeight: 1.5 }}>{detail}</p>
    </main>
  );
}
