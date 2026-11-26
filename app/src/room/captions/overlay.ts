import type * as Catalog from "@moq/hang/catalog";
import { Effect, type Getter } from "@moq/signals";
import * as DOM from "@moq/signals/dom";
import * as Watch from "@moq/watch";
import Settings from "../../settings";
import type { Broadcast } from "../broadcast";

/**
 * Pick the caption track to show for a reader of `language`: an exact language match, else one in
 * the same base language (`es` for `es-419`), else the first track by name, so a reader still sees
 * captions in a language they didn't ask for rather than none. Tracks the renderer can't display
 * are skipped.
 */
export function pick(available: Record<string, Catalog.TextConfig>, language: string): string | undefined {
	const want = language.toLowerCase();
	const base = want.split("-")[0];

	let best: { name: string; score: number } | undefined;
	for (const name of Object.keys(available).sort()) {
		const config = available[name];
		if (!Watch.Text.renderable(config)) continue;

		const lang = config.lang?.toLowerCase();
		const score = lang === want ? 2 : lang?.split("-")[0] === base ? 1 : 0;
		if (!best || score > best.score) best = { name, score };
	}
	return best?.name;
}

/** The language captions are read in: the chosen one, else the browser's. */
export function reading(effect: Effect): string {
	return effect.get(Settings.captions.read) ?? navigator.language;
}

/**
 * Captions floating over one tile: a remote participant's caption track, played in sync with their
 * audio, or the local speaker's own transcript so they can see what others read.
 */
export class Overlay {
	readonly #broadcast: Broadcast;
	readonly #signals = new Effect();

	constructor(broadcast: Broadcast) {
		this.#broadcast = broadcast;
		// The about page's scripted tiles have nothing to caption.
		if (broadcast.source.role !== "fake") this.#signals.run(this.#run.bind(this));
	}

	#run(effect: Effect) {
		const source = this.#broadcast.source;
		if (source.role === "fake" || !effect.get(Settings.captions.render)) return;

		const root = DOM.create("div", { className: "hang-captions fixed pointer-events-none" });
		this.#follow(effect, root);

		if (source.role === "watch") {
			effect.run((inner) => {
				const target = pick(inner.get(source.text.available), reading(inner));
				inner.set(source.text.target, target, undefined);
			});
			effect.set(source.text.container, root, undefined);
		} else {
			this.#local(effect, root, source.captions);
		}

		DOM.render(effect, document.body, root);
	}

	// The speaker's own caption, styled like the ones everyone else sees.
	#local(effect: Effect, root: HTMLElement, text: Getter<string | undefined>) {
		effect.run((inner) => {
			const caption = inner.get(text);
			if (!caption) return;

			const line = DOM.create("div", { className: "absolute inset-x-0 bottom-[4%] px-[4%] text-center" });
			const cue = DOM.create("span", { className: "hang-cue", textContent: caption });
			line.appendChild(cue);
			DOM.render(inner, root, line);
		});
	}

	// Keep `root` over the tile as it moves, resizes, and changes depth.
	#follow(effect: Effect, root: HTMLElement) {
		const broadcast = this.#broadcast;
		effect.run((inner) => {
			const bounds = inner.get(broadcast.bounds);
			const viewport = inner.get(broadcast.canvas.viewport);
			const canvas = broadcast.canvas.element.getBoundingClientRect();
			const scaleX = canvas.width / viewport.x;
			const scaleY = canvas.height / viewport.y;

			root.style.left = `${Math.round(bounds.position.x * scaleX + canvas.left)}px`;
			root.style.top = `${Math.round(bounds.position.y * scaleY + canvas.top)}px`;
			root.style.width = `${Math.round(bounds.size.x * scaleX)}px`;
			root.style.height = `${Math.round(bounds.size.y * scaleY)}px`;
		});

		effect.run((inner) => {
			// Stacked like the tile's chat bubble.
			root.style.zIndex = `${100 + inner.get(broadcast.position).z}`;
		});

		effect.run((inner) => {
			root.style.visibility = inner.get(broadcast.online) ? "visible" : "hidden";
		});
	}

	close() {
		this.#signals.close();
	}
}
