import { Effect, Signal } from "@kixelated/signals";
import { render } from "solid-js/web";
import IconText from "~icons/mdi/comment-text";
import type { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";

type ChatMessage = {
	node: Node;
	timestamp: number;
};

export class Chat {
	canvas: Canvas;
	broadcast: Broadcast;

	signals = new Effect();

	// Keep track of the last two messages
	messages: ChatMessage[] = [];
	typingIndicator = new Signal<boolean>(false);

	constructor(broadcast: Broadcast, canvas: Canvas) {
		this.broadcast = broadcast;
		this.canvas = canvas;

		this.signals.effect(this.#render.bind(this));
	}

	#render(effect: Effect) {
		const root = document.createElement("div");
		root.style.position = "fixed";
		root.style.pointerEvents = "none";

		this.signals.effect((effect) => {
			const message = effect.get(this.broadcast.message);
			if (!message) return;

			// Add the new message to our list
			this.messages.push({
				node: message.cloneNode(true),
				timestamp: Date.now(),
			});

			// Keep only the last 2 messages
			if (this.messages.length > 2) {
				this.messages.shift();
			}

			// Re-render all messages
			this.#renderMessages(effect, root);
		});

		// Monitor typing status from preview info
		this.signals.effect((effect) => {
			const source = this.broadcast.source;
			if ("preview" in source && source.preview) {
				// For Watch broadcasts, preview data is in preview.preview
				if ("preview" in source.preview) {
					const info = effect.get(source.preview.preview);
					if (info && info.typing !== undefined) {
						this.typingIndicator.set(info.typing);
						// Re-render to show/hide typing indicator
						this.#renderMessages(effect, root);
					}
				}
				// For Publish broadcasts, preview data is in preview.info
				else if ("info" in source.preview) {
					const info = effect.get(source.preview.info);
					if (info && info.typing !== undefined) {
						this.typingIndicator.set(info.typing);
						// Re-render to show/hide typing indicator
						this.#renderMessages(effect, root);
					}
				}
			}
		});

		document.body.appendChild(root);
		effect.cleanup(() => document.body.removeChild(root));
	}

	#renderMessages(effect: Effect, root: HTMLElement) {
		// Clear existing messages
		while (root.firstChild) {
			root.removeChild(root.firstChild);
		}

		let cumulativeHeight = 0;

		// Render each message with appropriate offset
		this.messages.forEach((msg, index) => {
			const wrapper = this.#createMessageWrapper(effect, msg.node, index, cumulativeHeight);
			root.appendChild(wrapper);
			cumulativeHeight += wrapper.clientHeight + 8; // 8px gap between messages
		});

		// Add typing indicator if someone is typing
		if (this.typingIndicator.peek()) {
			const typingWrapper = this.#createTypingIndicator(effect, cumulativeHeight);
			root.appendChild(typingWrapper);
		}
	}

	#createMessageWrapper(effect: Effect, node: Node, index: number, offsetTop: number): HTMLElement {
		const wrapper = document.createElement("div");
		wrapper.className =
			"flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-lg transition-all duration-500 shadow-lg bg-black/40 absolute max-w-sm";

		// Style for smooth animation
		wrapper.style.opacity = index === this.messages.length - 1 ? "0" : "1";
		wrapper.style.transform = index === this.messages.length - 1 ? "scale(1.1)" : "scale(1)";

		this.signals.effect((updateEffect) => {
			const bounds = updateEffect.get(this.broadcast.bounds).div(window.devicePixelRatio);
			const viewport = updateEffect.get(this.broadcast.canvas.viewport).div(window.devicePixelRatio);

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

			// Position message below the broadcast with offset for stacking
			const messageTop = pageBounds.y + pageBounds.height + offsetTop;
			const top = Math.min(canvasRect.top + canvasRect.height - wrapper.clientHeight - 40, messageTop);

			// Center message horizontally on broadcast
			const messageCenterX = pageBounds.x + pageBounds.width / 2;
			const left = Math.min(
				Math.max(canvasRect.left, messageCenterX - wrapper.clientWidth / 2),
				canvasRect.left + canvasRect.width - wrapper.clientWidth,
			);

			wrapper.style.left = `${left}px`;
			wrapper.style.top = `${top}px`;
			wrapper.style.fontSize = "18px";
		});

		this.signals.effect((updateEffect) => {
			const z = updateEffect.get(this.broadcast.targetPosition).z;
			wrapper.style.zIndex = `${100 + z - index}`;
		});

		const iconContainer = document.createElement("div");
		wrapper.appendChild(iconContainer);

		render(() => IconText({ class: "w-5 h-5 text-link-hue" }), iconContainer);

		wrapper.appendChild(node);

		// Animate in for new messages
		if (index === this.messages.length - 1) {
			setTimeout(() => {
				wrapper.style.opacity = "1";
				wrapper.style.transform = "scale(1)";
			}, 10);
		}

		// Auto-remove after 10 seconds
		const msg = this.messages[index];
		this.signals.timer(() => {
			const msgIndex = this.messages.indexOf(msg);
			if (msgIndex !== -1) {
				this.messages.splice(msgIndex, 1);
				const parent = wrapper.parentElement;
				if (parent) {
					this.#renderMessages(effect, parent);
				}
			}
		}, 10000);

		return wrapper;
	}

	#createTypingIndicator(_effect: Effect, offsetTop: number): HTMLElement {
		const wrapper = document.createElement("div");
		wrapper.className =
			"flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-lg transition-all duration-500 shadow-lg bg-black/40 absolute max-w-sm";

		wrapper.style.opacity = "0.8";

		this.signals.effect((updateEffect) => {
			const bounds = updateEffect.get(this.broadcast.bounds).div(window.devicePixelRatio);
			const viewport = updateEffect.get(this.broadcast.canvas.viewport).div(window.devicePixelRatio);

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

			// Position typing indicator below all messages
			const messageTop = pageBounds.y + pageBounds.height + offsetTop;
			const top = Math.min(canvasRect.top + canvasRect.height - wrapper.clientHeight - 40, messageTop);

			// Center message horizontally on broadcast
			const messageCenterX = pageBounds.x + pageBounds.width / 2;
			const left = Math.min(
				Math.max(canvasRect.left, messageCenterX - wrapper.clientWidth / 2),
				canvasRect.left + canvasRect.width - wrapper.clientWidth,
			);

			wrapper.style.left = `${left}px`;
			wrapper.style.top = `${top}px`;
			wrapper.style.fontSize = "18px";
		});

		this.signals.effect((updateEffect) => {
			const z = updateEffect.get(this.broadcast.targetPosition).z;
			wrapper.style.zIndex = `${98 + z}`;
		});

		// Create typing dots
		const dotsContainer = document.createElement("div");
		dotsContainer.className = "flex items-center gap-1 px-2";

		for (let i = 0; i < 3; i++) {
			const dot = document.createElement("div");
			dot.className = "w-2 h-2 bg-white/60 rounded-full animate-bounce";
			dot.style.animationDelay = `${i * 0.1}s`;
			dotsContainer.appendChild(dot);
		}

		wrapper.appendChild(dotsContainer);

		return wrapper;
	}

	close() {
		this.signals.close();
	}
}
