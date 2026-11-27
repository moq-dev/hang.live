import { Effect, Signal } from "@moq/signals";
import * as DOM from "@moq/signals/dom";
import type { Broadcast } from "./broadcast";

export class Name {
	broadcast: Broadcast;

	signals = new Effect();

	#hovering = new Signal(false);
	#profile = new Signal(false);

	constructor(broadcast: Broadcast) {
		this.broadcast = broadcast;

		this.signals.run(this.#render.bind(this));
	}

	setHovering(hovering: boolean) {
		this.#hovering.set(hovering);
	}

	setProfile(profile: boolean) {
		this.#profile.set(profile);
	}

	#render(effect: Effect) {
		const root = DOM.create("div", {
			className:
				"fixed pointer-events-none transition-opacity duration-200 text-white font-bold [text-shadow:_-1px_-1px_0_#000,_1px_-1px_0_#000,_-1px_1px_0_#000,_1px_1px_0_#000] overflow-hidden text-ellipsis whitespace-nowrap select-none",
		});

		// Update name text
		effect.run((effect) => {
			const name = effect.get(this.broadcast.source.user.name);
			root.textContent = name || "";
		});

		this.broadcast.overlay(effect, root, (tile, canvas) => {
			// Position name at top-left of broadcast with offset
			const fontSize = 12;
			const offset = 12;

			// Clamp position to stay within canvas bounds
			const left = Math.round(Math.max(canvas.left + offset, Math.min(tile.x + offset, canvas.right - offset)));
			const top = Math.round(
				Math.max(canvas.top + offset, Math.min(tile.y + offset, canvas.bottom - fontSize - offset)),
			);

			root.style.left = `${left}px`;
			root.style.top = `${top}px`;
			root.style.fontSize = `${fontSize}px`;

			// Max width should be constrained by both broadcast width and canvas bounds
			const maxWidthFromBroadcast = Math.max(0, tile.width - 2 * offset);
			const maxWidthFromCanvas = Math.max(0, canvas.right - left - offset);
			root.style.maxWidth = `${Math.min(maxWidthFromBroadcast, maxWidthFromCanvas)}px`;
		});

		// Control opacity based on hovering or profile mode
		effect.run((effect) => {
			const hovering = effect.get(this.#hovering);
			const profile = effect.get(this.#profile);
			root.style.opacity = hovering || profile ? "1" : "0";
		});

		DOM.render(effect, document.body, root);
	}

	close() {
		this.signals.close();
	}
}
