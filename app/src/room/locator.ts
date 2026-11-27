import * as Clock from "@moq/clock";
import { Effect, Signal } from "@moq/signals";
import * as DOM from "@moq/signals/dom";
import type { Broadcast } from "./broadcast";
import type { HangLocalSource } from "./local";

// An arrow over our own tile for its first seconds, so we can find ourselves.
export class Locator {
	broadcast: Broadcast<HangLocalSource>;
	signals = new Effect();

	#visible = new Signal(true);

	constructor(broadcast: Broadcast<HangLocalSource>) {
		this.broadcast = broadcast;

		this.signals.run(this.#render.bind(this));

		// Start fading out after 7 seconds
		this.signals.timer(() => {
			this.#visible.set(false);
		}, Clock.Duration.millis(7000));
	}

	#render(effect: Effect) {
		// Container for arrow and text
		const root = DOM.create("div", {
			className: "fixed pointer-events-none transition-opacity duration-1000 animate-throb",
		});

		// Arrow pointing down
		const arrow = DOM.create("div", {
			className: "absolute left-1/2 -translate-x-1/2",
		});

		// Triangle SVG for the arrow
		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "32");
		svg.setAttribute("height", "32");
		svg.setAttribute("viewBox", "0 0 32 32");

		const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
		path.setAttribute("d", "M16 28 L8 16 L24 16 Z");
		path.setAttribute("fill", "#FFD700");
		path.setAttribute("stroke", "#000");
		path.setAttribute("stroke-width", "2");

		svg.appendChild(path);
		arrow.appendChild(svg);
		root.appendChild(arrow);

		// "YOU" text above the arrow
		const text = DOM.create("div", {
			className:
				"absolute left-1/2 -translate-x-1/2 -top-8 font-bold text-2xl text-[#FFD700] [text-shadow:_0_0_8px_rgb(0_0_0_/_80%),_2px_2px_4px_rgb(0_0_0)]",
			textContent: "YOU",
		});
		root.appendChild(text);

		// Point at the middle of the tile's top edge from a little above it, kept within the canvas.
		this.broadcast.overlay(effect, root, (tile, canvas) => {
			const gap = 60;
			root.style.left = `${Math.min(Math.max(canvas.left, tile.x + tile.width / 2), canvas.right)}px`;
			root.style.top = `${Math.max(canvas.top, tile.y - gap)}px`;
		});

		// Control opacity based on visible signal
		effect.run((effect) => {
			const visible = effect.get(this.#visible);
			root.style.opacity = visible ? "1" : "0";
		});

		DOM.render(effect, document.body, root);
	}

	close() {
		this.signals.close();
	}
}
