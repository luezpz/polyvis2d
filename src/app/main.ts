/** Browser entry point. */

import "./styles.css";
import { App } from "./app";

const canvas = document.querySelector<HTMLCanvasElement>("#viewport");
const panel = document.querySelector<HTMLElement>("#panel");
const status = document.querySelector<HTMLElement>("#status");
if (!canvas || !panel || !status) throw new Error("index.html is missing #viewport, #panel or #status");

// Exposed for debugging from the devtools console.
(window as unknown as { polyvis: App }).polyvis = new App(canvas, panel, status);
