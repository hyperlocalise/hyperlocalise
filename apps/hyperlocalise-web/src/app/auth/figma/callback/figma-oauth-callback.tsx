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
"use client";

import { useEffect, useMemo } from "react";
import { useSearchParams } from "next/navigation";

export const FIGMA_OAUTH_MESSAGE_TYPE = "hyperlocalise-figma-oauth";

export function FigmaOAuthCallback() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const status = useMemo(() => {
    if (error) {
      return "error" as const;
    }
    if (code) {
      return "success" as const;
    }
    return "missing" as const;
  }, [code, error]);

  useEffect(() => {
    if (!window.opener) {
      return;
    }

    window.opener.postMessage(
      {
        type: FIGMA_OAUTH_MESSAGE_TYPE,
        code,
        state,
        error: error ?? (status === "missing" ? "missing_authorization_code" : null),
        errorDescription,
      },
      "*",
    );
  }, [code, error, errorDescription, state, status]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "Inter, system-ui, sans-serif",
        padding: 24,
      }}
    >
      <section style={{ maxWidth: 420, textAlign: "center" }}>
        <h1 style={{ fontSize: 22, marginBottom: 8 }}>
          {status === "success" ? "Signed in to Hyperlocalise" : "Could not finish sign-in"}
        </h1>
        <p style={{ color: "#525252", lineHeight: 1.5 }}>
          {status === "success"
            ? "Return to the Figma plugin. You can close this tab."
            : (errorDescription ??
              "The Figma plugin did not receive an authorization code. Close this tab and try again.")}
        </p>
      </section>
    </main>
  );
}
