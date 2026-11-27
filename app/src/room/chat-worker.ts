import * as Comlink from "comlink";
import { marked } from "marked";

// Renders chat Markdown off the main thread; exported only for its type, since Comlink serves it.
// Links and raw HTML are made safe on the main thread by sanitize.ts.
export default marked.parse;
Comlink.expose(marked.parse);
