import { Effect, Signal } from "@kixelated/signals";
import { render } from "solid-js/web";
import IconText from "~icons/mdi/comment-text";
import IconCaption from "~icons/mdi/microphone";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";

export class Chat {
	canvas: Canvas;
	broadcast: Broadcast;

	signals = new Effect();

	#offset = new Signal<number | undefined>(undefined);

	constructor(broadcast: Broadcast, canvas: Canvas) {
		this.broadcast = broadcast;
		this.canvas = canvas;

		this.signals.effect(this.#render.bind(this));
	}

	#render(effect: Effect) {
		const root = document.createElement("div");

		this.signals.effect((effect) => {
			const message = effect.get(this.broadcast.message);
			if (!message) return;

			this.#message(effect, root, message.cloneNode(true), "text");
		});

		this.signals.effect((effect) => {
			if (!effect.get(Settings.renderCaptions)) return;

			const caption = effect.get(this.broadcast.source.audio.caption);
			if (!caption) return;

			this.#message(effect, root, document.createTextNode(caption), "caption");
		});

		document.body.appendChild(root);
		effect.cleanup(() => document.body.removeChild(root));
	}

	#message(effect: Effect, root: HTMLElement, node: Node, type: "text" | "caption") {
		const wrapper = document.createElement("div");
		wrapper.className =
			"flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-lg transition-opacity transition-margin transition-transform duration-500 transform scale-125 opacity-0 shadow-lg bg-black/40 fixed max-w-sm";
		root.appendChild(wrapper);

		effect.effect((effect) => {
			const bounds = effect.get(this.broadcast.bounds).div(window.devicePixelRatio);
			const viewport = effect.get(this.broadcast.canvas.viewport).div(window.devicePixelRatio);

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
			const top = Math.min(canvasRect.top + canvasRect.height - wrapper.clientHeight - 40, messageTop);

			// Center message horizontally on broadcast
			const messageCenterX = pageBounds.x + pageBounds.width / 2;
			const left = Math.min(
				Math.max(canvasRect.left, messageCenterX - wrapper.clientWidth / 2),
				canvasRect.left + canvasRect.width - wrapper.clientWidth,
			);

			const offset = type === "caption" ? (effect.get(this.#offset) ?? 0) : 0;

			wrapper.style.left = `${left}px`;
			wrapper.style.top = `${top}px`;
			wrapper.style.fontSize = "18px";
			wrapper.style.marginTop = `${offset}px`;
		});

		const iconContainer = document.createElement("div");
		iconContainer.className = "animate-pulse";
		wrapper.appendChild(iconContainer);

		const icon = type === "text" ? IconText : IconCaption;
		render(() => icon({ class: "w-5 h-5 text-link-hue" }), iconContainer);

		wrapper.appendChild(node);

		// Animate in with multiple effects
		effect.timer(() => {
			wrapper.classList.remove("scale-125", "opacity-0");
			wrapper.classList.add("scale-100", "opacity-100");
		}, 10);

		effect.timer(() => {
			iconContainer.classList.remove("animate-pulse");
		}, 2000);

		effect.cleanup(() => {
			// Ensure smooth fade out
			wrapper.style.transition = "all 500ms ease-out";
			wrapper.style.opacity = "0";
			wrapper.style.transform = "scale(0.95) translateY(-10px)";
			wrapper.style.pointerEvents = "none";

			setTimeout(() => {
				root.removeChild(wrapper);
			}, 500);
		});

		if (type === "text") {
			effect.set(this.#offset, wrapper.clientHeight);
		}
	}

	close() {
		this.signals.close();
	}
}
