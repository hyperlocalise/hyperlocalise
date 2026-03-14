import { renderApp } from "./app";
import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (root === null) {
  throw new Error("missing #app root");
}

root.innerHTML = renderApp();
