import * as Comlink from "comlink";
import { marked } from "marked";

// Links and raw HTML are made safe on the main thread by sanitize.ts.
export default marked.parse; // just for types
Comlink.expose(marked.parse);
