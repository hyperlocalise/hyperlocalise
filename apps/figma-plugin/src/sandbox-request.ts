import type { SandboxToUiMessage, UiToSandboxMessage } from "./plugin-messages";

export function postPluginMessage(message: UiToSandboxMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

export function requestFromSandbox<T extends SandboxToUiMessage["type"]>(
  message: UiToSandboxMessage,
  expectedType: T,
): Promise<Extract<SandboxToUiMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const handleMessage = (event: MessageEvent<{ pluginMessage?: SandboxToUiMessage }>) => {
      const payload = event.data.pluginMessage;
      if (!payload) {
        return;
      }
      if (payload.type === "error") {
        window.removeEventListener("message", handleMessage);
        reject(new Error(payload.message));
        return;
      }
      if (payload.type === expectedType) {
        window.removeEventListener("message", handleMessage);
        resolve(payload as Extract<SandboxToUiMessage, { type: T }>);
      }
    };

    window.addEventListener("message", handleMessage);
    postPluginMessage(message);
  });
}
