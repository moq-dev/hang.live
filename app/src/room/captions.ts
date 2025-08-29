import { Effect } from "@kixelated/signals";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";

export class Captions {
	canvas: Canvas;
	broadcast: Broadcast;

	signals = new Effect();

	constructor(broadcast: Broadcast, canvas: Canvas) {
		this.broadcast = broadcast;
		this.canvas = canvas;

		this.signals.effect(this.#render.bind(this));
	}

	#render(effect: Effect) {
		const root = document.createElement("div");

		this.signals.effect((effect) => {
			if (!effect.get(Settings.captions.render)) return;

			const caption = effect.get(this.broadcast.source.audio.captions.text);
			if (!caption) return;

			this.#caption(effect, root, document.createTextNode(caption));
		});

		document.body.appendChild(root);
		effect.cleanup(() => document.body.removeChild(root));
	}

	#caption(effect: Effect, root: HTMLElement, node: Node) {
		const wrapper = document.createElement("div");
		wrapper.className =
			"flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-lg transition-opacity transition-transform duration-500 transform scale-125 opacity-0 shadow-lg bg-black/40 fixed max-w-sm";
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

			// Position caption ABOVE the broadcast
			const captionBottom = pageBounds.y;
			const top = Math.max(canvasRect.top, captionBottom - wrapper.clientHeight - 10);

			// Center caption horizontally on broadcast
			const captionCenterX = pageBounds.x + pageBounds.width / 2;
			const left = Math.min(
				Math.max(canvasRect.left, captionCenterX - wrapper.clientWidth / 2),
				canvasRect.left + canvasRect.width - wrapper.clientWidth,
			);

			wrapper.style.left = `${left}px`;
			wrapper.style.top = `${top}px`;
			wrapper.style.fontSize = "18px";
		});

		effect.effect((effect) => {
			const z = effect.get(this.broadcast.targetPosition).z;
			wrapper.style.zIndex = `${100 + z}`;
		});

		const iconContainer = document.createElement("div");
		iconContainer.className = "animate-pulse";
		wrapper.appendChild(iconContainer);

		// Create icon element
		const iconSpan = document.createElement("span");
		iconSpan.className = "icon-[mdi--microphone] text-link-hue";
		iconContainer.appendChild(iconSpan);

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
			wrapper.style.transform = "scale(0.95) translateY(10px)";
			wrapper.style.pointerEvents = "none";

			setTimeout(() => {
				root.removeChild(wrapper);
			}, 500);
		});
	}

	close() {
		this.signals.close();
	}
}
