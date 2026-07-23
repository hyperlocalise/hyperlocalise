import { createRoot } from "react-dom/client";

import { App } from "./app";

const rootElement = document.getElementById("react-page");
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
