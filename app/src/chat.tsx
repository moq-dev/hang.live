import { Effect, Signal } from "@kixelated/signals";
import solid from "@kixelated/signals/solid";
import { For, onCleanup } from "solid-js";
import { render } from "solid-js/web";
import IconText from "~icons/mdi/comment-text";
import IconCaption from "~icons/mdi/microphone";
import { Canvas } from "./canvas";
import type { Room } from "./room";
import type { Broadcast } from "./room/broadcast";

import "github-markdown-css/github-markdown-dark.css";

export function Chat(props: { canvas: Canvas; room: Room }) {
	const broadcasts = solid(props.room.broadcasts);

	return (
		<For each={broadcasts()}>
			{(broadcast) => {
				const bubble = new ChatBubble(props.canvas, broadcast);
				onCleanup(() => bubble.close());
				return bubble.render();
			}}
		</For>
	);
}

// Custom Web Component for chat bubbles
class ChatBubble {
	canvas: Canvas;
	broadcast: Broadcast;

	signals = new Effect();

	#offset = new Signal<number | undefined>(undefined);

	constructor(canvas: Canvas, broadcast: Broadcast) {
		this.canvas = canvas;
		this.broadcast = broadcast;
	}

	render(): HTMLElement {
		const root = document.createElement("div");

		this.signals.effect((effect) => {
			const message = effect.get(this.broadcast.message);
			if (!message) return;

			this.#message(effect, root, message.cloneNode(true), "text");
		});

		this.signals.effect((effect) => {
			const caption = effect.get(this.broadcast.source.audio.caption);
			if (!caption) return;

			this.#message(effect, root, document.createTextNode(caption), "caption");
		});

		return root;
	}

	#message(effect: Effect, root: HTMLElement, node: Node, type: "text" | "caption") {
		const wrapper = document.createElement("div");
		wrapper.className =
			"flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-lg transition-opacity transition-margin transition-transform duration-500 transform scale-125 opacity-0 shadow-lg bg-black/40 fixed max-w-sm";
		root.appendChild(wrapper);

		effect.effect((effect) => {
			const bounds = effect.get(this.broadcast.bounds).div(window.devicePixelRatio);
			const viewport = effect.get(this.broadcast.viewport).div(window.devicePixelRatio);

			const top = Math.min(viewport.y - wrapper.clientHeight - 40, bounds.position.y + bounds.size.y);
			const left = Math.min(
				Math.max(0, bounds.position.x + bounds.size.x / 2 - wrapper.clientWidth / 2),
				viewport.x - wrapper.clientWidth,
			);
			const offset = type === "caption" ? (effect.get(this.#offset) ?? 0) : 0;

			wrapper.style.left = `${left}px`;
			wrapper.style.top = `${top}px`;
			wrapper.style.fontSize = `${12 + Math.sqrt(wrapper.clientWidth / 10)}px`;
			wrapper.style.marginTop = `${offset}px`;
		});

		const iconContainer = document.createElement("div");
		iconContainer.className = "animate-pulse";
		wrapper.appendChild(iconContainer);

		const icon = type === "text" ? IconText : IconCaption;
		render(() => icon({ class: "w-5 h-5", style: "color: hsl(var(--link-hue), 70%, 50%)" }), iconContainer);

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
