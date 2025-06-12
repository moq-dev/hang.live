import { render } from "solid-js/web";
import { Background } from "./background";

const background = document.getElementById("bg");
if (!background) {
	throw new Error("No background element found");
}

render(() => <Background />, background);
