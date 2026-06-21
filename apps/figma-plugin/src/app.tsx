import { useEffect, useState } from "react";

import "./ui.css";

type TranslateMode = "with-formatting" | "without-formatting";

type PluginMessage = { type: "translate"; mode: TranslateMode } | { type: "cancel" };

function postPluginMessage(message: PluginMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

export function App() {
  const [inProgressMode, setInProgressMode] = useState<TranslateMode | undefined>(undefined);

  const translate = (mode: TranslateMode) => {
    setInProgressMode(mode);
    postPluginMessage({ type: "translate", mode });
  };

  useEffect(() => {
    const handler = (event: MessageEvent<{ pluginMessage?: { type: string } }>) => {
      if (event.data.pluginMessage?.type === "done") {
        setInProgressMode(undefined);
      }
    };

    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  return (
    <div className="container">
      <p className="description">
        This example demonstrates how plugins can translate all text on the current page.
        Translation is simulated with lorem ipsum placeholder text.
      </p>
      <div className="actions">
        <button
          type="button"
          className="button buttonPrimary"
          onClick={() => translate("with-formatting")}
          disabled={inProgressMode != null}
        >
          {inProgressMode === "with-formatting" ? "Translating…" : "Translate with formatting"}
        </button>
        <button
          type="button"
          className="button buttonPrimary"
          onClick={() => translate("without-formatting")}
          disabled={inProgressMode != null}
        >
          {inProgressMode === "without-formatting"
            ? "Translating…"
            : "Translate without formatting"}
        </button>
      </div>
      <div className="footer">
        <button
          type="button"
          className="button"
          onClick={() => postPluginMessage({ type: "cancel" })}
          disabled={inProgressMode != null}
        >
          Close
        </button>
      </div>
    </div>
  );
}
