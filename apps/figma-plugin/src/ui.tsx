import { render } from "preact";

import { App } from "./app";

const rootElement = document.getElementById("react-page");
if (rootElement) {
  render(<App />, rootElement);
}
