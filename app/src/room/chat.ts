import * as Clock from "@moq/clock";
import { Effect, Signal } from "@moq/signals";
import * as DOM from "@moq/signals/dom";
import * as Comlink from "comlink";
import type { Broadcast } from "./broadcast";
import type ChatWorker from "./chat-worker";
import { sanitizer } from "./sanitize";

const worker = new Worker(new URL("./chat-worker.ts", import.meta.url), { type: "module" });
const parse = Comlink.wrap<typeof ChatWorker>(worker);
const sanitize = sanitizer(window);

// The chat bubble under a tile, showing its latest message.
export class Chat {
	broadcast: Broadcast;

	signals = new Effect();

	constructor(broadcast: Broadcast) {
		this.broadcast = broadcast;

		this.signals.run(this.#render.bind(this));
	}

	#render(effect: Effect) {
		const root = DOM.create("div", {
			className:
				"flex items-center gap-2 px-3 py-2 backdrop-blur-md rounded-lg transition-transform transition-opacity ease-out transform duration-200 shadow-lg bg-black/40 fixed max-w-sm text-xl",
		});

		const icon = document.createElement("div");
		icon.className = "text-link-hue scale-x-[-1]";
		DOM.render(effect, root, icon);

		// Place the message below the tile, centered on it and kept within the canvas.
		const place = this.broadcast.overlay(effect, root, (tile, canvas) => {
			const top = Math.round(Math.min(canvas.bottom - root.clientHeight - 40, tile.bottom));
			const center = tile.x + tile.width / 2;
			const left = Math.round(
				Math.min(Math.max(canvas.left, center - root.clientWidth / 2), canvas.right - root.clientWidth),
			);

			root.style.left = `${left}px`;
			root.style.top = `${top}px`;
		});

		// Save the previous message so we can fade-out.
		const message = new Signal<Node | undefined>(undefined);
		effect.run((effect) => {
			const current = effect.get(this.broadcast.message)?.cloneNode(true);
			if (current) {
				message.set(current);

				// Scale up for 200ms right after a (new) message appears, letting CSS animate it.
				effect.timer(
					effect.run((effect) => DOM.setClass(effect, root, "scale-110")),
					Clock.Duration.millis(200),
				);

				// Pulse for 2 seconds, a full loop by default.
				effect.timer(
					effect.run((effect) => DOM.setClass(effect, icon, "animate-pulse")),
					Clock.Duration.millis(2000),
				);
			} else if (message.peek()) {
				// Clear the message after a short delay; a new message reruns this and cancels it.
				effect.timer(() => message.set(undefined), Clock.Duration.millis(200));
			}
		});

		effect.run((effect) => {
			// We're not using DOM.render here so we can immediately adjust the left/top position when inserted
			const msg = effect.get(message);
			if (!msg) return;

			root.appendChild(msg);
			effect.cleanup(() => root.removeChild(msg));

			// Its width changed, so center it again.
			place();
		});

		effect.run((effect) => {
			const message = effect.get(this.broadcast.message); // NOT source.chat.message.latest to ignore /slash commands
			const typing = effect.get(this.broadcast.source.chat.typing.active);
			if (!message && !typing) {
				DOM.setClass(effect, root, "opacity-0", "pointer-events-none");
			} else {
				DOM.setClass(effect, root, "opacity-100", "pointer-events-auto");
			}
		});

		effect.run((effect) => {
			const typing = effect.get(this.broadcast.source.chat.typing.active);
			DOM.setClass(effect, icon, typing ? "icon-[mdi--chat-typing]" : "icon-[mdi--chat]");
		});

		DOM.render(effect, document.body, root);
	}

	// Given markdown, returns sanitized HTML.
	// Markdown parsing runs in a background WebWorker to prevent DoS attacks.
	async parse(msg: string): Promise<HTMLSpanElement> {
		// Parse markdown in the worker
		const html = await parse(msg);

		// Sanitize HTML on the main thread where DOMPurify has DOM access
		const sanitized = sanitize(html);

		// Wrap the fragment in a container element for easier handling
		const container = document.createElement("span");
		container.appendChild(sanitized);

		return container;
	}

	close() {
		this.signals.close();
	}
}
