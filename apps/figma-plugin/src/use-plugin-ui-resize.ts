import { useEffect } from "preact/hooks";

import { measurePluginUiHeight } from "./plugin-ui-size";
import type { UiToSandboxMessage } from "./plugin-messages";

export function usePluginUiResize(
  rootRef: { current: HTMLElement | null },
  postMessage: (message: UiToSandboxMessage) => void,
  layoutKey: string,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) {
      return;
    }

    let frame = 0;

    const publishHeight = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        postMessage({ type: "resize-ui", height: measurePluginUiHeight(root) });
      });
    };

    publishHeight();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(() => {
      publishHeight();
    });
    observer.observe(root);

    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [layoutKey]);
}
