import { Effect, Signal } from "@kixelated/signals";
import * as DOM from "@kixelated/signals/dom";
import type { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";
import { Bounds, Vector } from "./geometry";

export class Chat {
	canvas: Canvas;
	broadcast: Broadcast;

	signals = new Effect();

	constructor(broadcast: Broadcast, canvas: Canvas) {
		this.broadcast = broadcast;
		this.canvas = canvas;

		this.signals.effect(this.#render.bind(this));
	}

	#render(effect: Effect) {
		const root = DOM.create("div", {
			className:
				"flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-lg transition-all ease-out transform duration-200 shadow-lg bg-black/40 fixed max-w-sm",
		});

		const icon = document.createElement("div");
		icon.className = "w-5 h-5 text-link-hue scale-x-[-1]";
		DOM.render(effect, root, icon);

		// Update the position of the message when the broadcast bounds, viewport, or message (width) changes.
		const updatePosition = (bounds: Bounds, viewport: Vector) => {
			// Get the canvas element's position on the page
			const canvasRect = this.canvas.element.getBoundingClientRect();

			// Scale bounds from canvas coordinates to page coordinates
			const scaleX = canvasRect.width / viewport.x;
			const scaleY = canvasRect.height / viewport.y;

			// Transform bounds to page coordinates
			const pageBounds = {
				x: bounds.position.x * scaleX + canvasRect.left,
				y: bounds.position.y * scaleY + canvasRect.top,
				width: bounds.size.x * scaleX,
				height: bounds.size.y * scaleY,
			};

			// Position message below the broadcast
			const messageTop = pageBounds.y + pageBounds.height;
			const top = Math.round(
				(window.devicePixelRatio *
					Math.min(canvasRect.top + canvasRect.height - root.clientHeight - 40, messageTop)) /
					window.devicePixelRatio,
			);

			// Center message horizontally on broadcast
			const messageCenterX = pageBounds.x + pageBounds.width / 2;
			const left = Math.round(
				(window.devicePixelRatio *
					Math.min(
						Math.max(canvasRect.left, messageCenterX - root.clientWidth / 2),
						canvasRect.left + canvasRect.width - root.clientWidth,
					)) /
					window.devicePixelRatio,
			);

			root.style.left = `${left}px`;
			root.style.top = `${top}px`;
			root.style.fontSize = "18px";
		};

		// Save the previous message so we can fade-out.
		const message = new Signal<Node>(document.createElement("span"));
		effect.effect((effect) => {
			const current = effect.get(this.broadcast.message)?.cloneNode(true);
			if (current) {
				message.set(current);

				// Scale up right after a (new) message appears, letting CSS animate it.
				effect.timeout((effect) => {
					DOM.setClass(effect, root, "scale-110");
				}, 200);

				// Pulse for 2 seconds, a full loop by default.
				effect.timeout((effect) => {
					DOM.setClass(effect, icon, "animate-pulse");
				}, 2000);
			} else {
				// Clear the message after a short delay.
				effect.timeout(() => {
					message.set(document.createElement("span"));
				}, 200);
			}
		});

		effect.effect((effect) => {
			// We're not using DOM.render here so we can immediately adjust the left/top position when inserted
			const msg = effect.get(message);
			if (!msg) return;

			root.appendChild(msg);
			effect.cleanup(() => root.removeChild(msg));

			updatePosition(this.broadcast.bounds.peek(), this.broadcast.canvas.viewport.peek());
		});

		effect.effect((effect) => {
			const message = effect.get(this.broadcast.source.chat.message.latest);
			const typing = effect.get(this.broadcast.source.chat.typing.active);
			if (!message && !typing) {
				DOM.setClass(effect, root, "opacity-0", "pointer-events-none");
			} else {
				DOM.setClass(effect, root, "opacity-100", "pointer-events-auto");
			}
		});

		effect.effect((effect) => {
			const z = effect.get(this.broadcast.targetPosition).z;
			root.style.zIndex = `${100 + z}`;
		});

		// Move the chat around to the correct position while there's a message or typing.
		effect.effect((effect) => {
			const bounds = effect.get(this.broadcast.bounds).div(window.devicePixelRatio);
			const viewport = effect.get(this.broadcast.canvas.viewport).div(window.devicePixelRatio);
			updatePosition(bounds, viewport);
		});

		effect.effect((effect) => {
			const typing = effect.get(this.broadcast.source.chat.typing.active);
			DOM.setClass(effect, icon, typing ? "icon-[mdi--chat-typing]" : "icon-[mdi--chat]");
		});

		DOM.render(effect, document.body, root);
	}

	close() {
		this.signals.close();
	}
}
