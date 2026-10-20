"use client";

/*
 * Copyright (c) 2026 Hyperlocalise Pty Ltd
 *
 * Use of this software is governed by the Business Source License 1.1
 * included in this application's LICENSE file.
 *
 * Change Date: Four years after publication of the applicable version.
 *
 * On the Change Date, in accordance with the Business Source License, use
 * of this software will be governed by the GNU General Public License
 * Version 2.0 or later.
 */
import { useEffect, useState } from "react";

export default function SanityOAuthCallbackPage() {
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
        const response = await fetch("/api/oauth/sanity/handoff/complete", {
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
          setDetail("Could not finish sign-in. Close this window and try again in Studio.");
          return;
        }
      } catch {
        setDetail("Could not finish sign-in. Close this window and try again in Studio.");
        return;
      }

      if (error) {
        setDetail(errorDescription ?? error);
        window.close();
        return;
      }
      if (code) {
        setDetail("Connected. Returning to Sanity Studio…");
        window.close();
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
