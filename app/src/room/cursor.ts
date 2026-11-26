import { Effect } from "@moq/signals";
import * as DOM from "@moq/signals/dom";
import type { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import type { WatchBroadcast } from "./watch";

const SVG = "http://www.w3.org/2000/svg";

/** A remote participant's pointer, drawn over the canvas wherever its live datagrams put it. */
export class Cursor {
	#broadcast: Broadcast<WatchBroadcast>;
	#canvas: Canvas;
	#signals = new Effect();

	constructor(broadcast: Broadcast<WatchBroadcast>, canvas: Canvas) {
		this.#broadcast = broadcast;
		this.#canvas = canvas;
		this.#signals.run(this.#render.bind(this));
	}

	#render(effect: Effect) {
		const arrow = document.createElementNS(SVG, "svg");
		arrow.setAttribute("viewBox", "0 0 16 20");
		arrow.setAttribute("width", "16");
		arrow.setAttribute("height", "20");
		const path = document.createElementNS(SVG, "path");
		path.setAttribute("d", "M1 1 L1 16 L5 12 L8 19 L11 18 L8 11 L14 11 Z");
		path.setAttribute("stroke", "black");
		path.setAttribute("stroke-width", "1.5");
		path.setAttribute("stroke-linejoin", "round");
		arrow.appendChild(path);

		const label = DOM.create("div", {
			className:
				"mt-4 -ml-1 px-1.5 rounded text-xs font-bold text-black whitespace-nowrap max-w-40 overflow-hidden text-ellipsis",
		});

		// The short transition interpolates between datagrams, hiding jitter and the odd drop.
		const root = DOM.create("div", {
			className:
				"fixed left-0 top-0 z-[1000] flex items-start pointer-events-none select-none transition-[transform,opacity] duration-75 ease-linear",
		});
		root.append(arrow, label);

		const source = this.#broadcast.source;

		effect.run((effect) => {
			label.textContent = effect.get(source.user.name) ?? "";
		});

		effect.run((effect) => {
			// Remote values are untrusted, but the browser ignores a color it can't parse.
			const color = effect.get(source.user.color) ?? "white";
			path.setAttribute("fill", color);
			label.style.backgroundColor = color;
		});

		effect.run((effect) => {
			const point = effect.get(source.location.live.cursor);
			const visible = effect.get(this.#broadcast.visible);
			const viewport = effect.get(this.#canvas.viewport);
			if (!point || !visible || viewport.x === 0 || viewport.y === 0) {
				root.style.opacity = "0";
				return;
			}

			const rect = this.#canvas.element.getBoundingClientRect();
			// Clamp to the canvas, since a peer with another aspect ratio may point past our edges.
			const x = rect.left + Math.min(Math.max(point.x + 0.5, 0), 1) * rect.width;
			const y = rect.top + Math.min(Math.max(point.y + 0.5, 0), 1) * rect.height;
			root.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
			root.style.opacity = "1";
		});

		DOM.render(effect, document.body, root);
	}

	close() {
		this.#signals.close();
	}
}
