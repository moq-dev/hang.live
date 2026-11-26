import { Duration, Instant, now } from "@moq/clock";
import type * as Moq from "@moq/net";
import { Effect, type Getter, Signal } from "@moq/signals";
import * as DOM from "@moq/signals/dom";
import { formatBitrate, formatFps, formatMillis, graph } from "@moq/ui";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import type { Bounds, Vector } from "./geometry";
import { Jitter } from "./jitter";
import type { WatchBroadcast } from "./watch";

// How often the HUD samples counters into its sparklines, matching MoQ's own stats overlays.
const POLL = Duration.millis(250);

// How long a simulcast switch stays highlighted.
const SWITCH = Duration.secs(3);

// The smallest on-screen tile, in CSS pixels, that fits the sparklines beside its rendition boxes.
const ROOMY = { width: 440, height: 240 };

const BOX = "px-2 py-1 rounded font-mono text-[11px] leading-snug whitespace-nowrap";
const PANEL = `bg-black/75 text-white ${BOX}`;

// @moq/ui's sparkline keeps its layout in a stylesheet made for MoQ's shadow roots, so lay it out here.
const GRAPHS =
	"flex flex-col gap-1 w-max min-w-40 [&_.graph-header]:flex [&_.graph-header]:justify-between [&_.graph-label]:text-white/50 [&_.graph-canvas]:block [&_.graph-canvas]:w-full [&_.graph-canvas]:h-6";

// Milliseconds on the monotonic clock, for turning counters into rates.
const at = () => now().since(Instant.ZERO).asMillis();

/** A rendition's catalog entry, as far as the HUD describes it. */
interface Rendition {
	codec: string;
	bitrate?: number;
	codedWidth?: number;
	codedHeight?: number;
	sampleRate?: number;
}

/** A simulcast switch between two renditions of one tile. */
interface Switch {
	from: string;
	to: string;
	/** Whether the new rendition has more pixels than the old. */
	up: boolean;
}

/**
 * The per-tile MoQ telemetry overlay shown in Debug mode: each rendition with the live one ringed,
 * simulcast switches as they happen, and sparklines of the tile's video and audio delivery.
 * Nothing runs while Debug is off.
 */
export class Debug {
	canvas: Canvas;
	broadcast: Broadcast;

	signals = new Effect();

	constructor(broadcast: Broadcast, canvas: Canvas) {
		this.broadcast = broadcast;
		this.canvas = canvas;

		this.signals.run(this.#render.bind(this));
	}

	#render(effect: Effect) {
		if (!effect.get(Settings.debug.tracks)) return;

		// Only a remote tile has a catalog and decoders to report on.
		const source = this.broadcast.source;
		if (source.role !== "watch") return;

		const root = DOM.create("div", {
			className: "fixed pointer-events-none select-none",
		});

		// Update the position of the debug overlay when the broadcast bounds or viewport changes
		const updatePosition = (bounds: Bounds, viewport: Vector) => {
			// Get the canvas element's position on the page
			const canvasRect = this.canvas.element.getBoundingClientRect();

			// Scale bounds from canvas coordinates to page coordinates
			const scaleX = canvasRect.width / viewport.x;
			const scaleY = canvasRect.height / viewport.y;

			root.style.left = `${Math.round(bounds.position.x * scaleX + canvasRect.left)}px`;
			root.style.top = `${Math.round(bounds.position.y * scaleY + canvasRect.top)}px`;
			root.style.width = `${Math.round(bounds.size.x * scaleX)}px`;
			root.style.height = `${Math.round(bounds.size.y * scaleY)}px`;

			// A small tile shows only its renditions, so the sparklines don't bury it.
			const roomy = bounds.size.x * scaleX >= ROOMY.width && bounds.size.y * scaleY >= ROOMY.height;
			delivery.style.display = roomy ? "" : "none";
		};

		const switched = this.#switches(effect, source);

		const video = DOM.create("div", { className: "absolute top-1 right-1 flex flex-col items-end gap-1" });
		this.#renditions(effect, video, {
			catalog: source.video.catalog,
			active: source.video.active,
			error: source.video.error,
			switched,
			// Format: "hd avc1 1280x720 @ 2.5Mb/s"
			describe: (rendition) => {
				const size =
					rendition.codedWidth && rendition.codedHeight
						? `${rendition.codedWidth}x${rendition.codedHeight}`
						: "?x?";
				const bitrate = rendition.bitrate !== undefined ? ` @ ${formatBitrate(rendition.bitrate)}` : "";
				return `${rendition.codec.split(".").shift()} ${size}${bitrate}`;
			},
		});
		this.#target(effect, video, source, switched);
		DOM.render(effect, root, video);

		const audio = DOM.create("div", { className: "absolute bottom-1 right-1 flex flex-col items-end gap-1" });
		this.#renditions(effect, audio, {
			catalog: source.audio.catalog,
			active: source.audio.active,
			error: source.audio.error,
			// Format: "opus 48kHz @ 64 kbps"
			describe: (rendition) => {
				const rate = rendition.sampleRate ? ` ${rendition.sampleRate / 1000}kHz` : "";
				const bitrate = rendition.bitrate !== undefined ? ` @ ${formatBitrate(rendition.bitrate)}` : "";
				return `${rendition.codec}${rate}${bitrate}`;
			},
		});
		DOM.render(effect, root, audio);

		const delivery = this.#delivery(effect, source);
		DOM.render(effect, root, delivery);

		// Update position when bounds, viewport, or zoom change
		effect.run((effect) => {
			const bounds = effect.get(this.broadcast.bounds);
			const viewport = effect.get(this.broadcast.canvas.viewport);
			updatePosition(bounds, viewport);
		});

		// Update position when window scrolls
		effect.event(
			window,
			"scroll",
			() => {
				const bounds = this.broadcast.bounds.peek();
				const viewport = this.broadcast.canvas.viewport.peek();
				updatePosition(bounds, viewport);
			},
			{ passive: true },
		);

		// Update z-index based on broadcast position
		effect.run((effect) => {
			const z = effect.get(this.broadcast.position).z;
			root.style.zIndex = `${100 + z}`;
		});

		DOM.render(effect, document.body, root);
	}

	// The latest simulcast switch while it is fresh, so the HUD can show the tile changing rendition.
	#switches(parent: Effect, source: WatchBroadcast): Getter<Switch | undefined> {
		const latest = new Signal<Switch | undefined>(undefined);

		// The previous active rendition outlives each rerun, which is what makes the change visible.
		let previous: string | undefined;
		parent.run((effect) => {
			const active = effect.get(source.video.active);
			if (!active) return;
			if (previous && previous !== active) {
				const renditions = source.video.catalog.peek()?.renditions ?? {};
				const pixels = (name: string) => {
					const rendition = renditions[name];
					return (rendition?.codedWidth ?? 0) * (rendition?.codedHeight ?? 0);
				};
				latest.set({ from: previous, to: active, up: pixels(active) > pixels(previous) });
			}
			previous = active;
		});

		parent.run((effect) => {
			if (effect.get(latest)) effect.timer(() => latest.set(undefined), SWITCH);
		});

		return latest;
	}

	// One box per catalog rendition, the selected one ringed: amber just after selection moved to it,
	// red if it failed to decode, green otherwise.
	#renditions(
		parent: Effect,
		container: HTMLElement,
		props: {
			catalog: Getter<{ renditions: Record<string, Rendition> } | undefined>;
			active: Getter<string | undefined>;
			error: Getter<Error | undefined>;
			switched?: Getter<Switch | undefined>;
			describe: (rendition: Rendition) => string;
		},
	) {
		parent.run((effect) => {
			const catalog = effect.get(props.catalog);
			if (!catalog) return;

			const active = effect.get(props.active);
			const error = effect.get(props.error);
			const switched = props.switched ? effect.get(props.switched) : undefined;

			for (const [name, rendition] of Object.entries(catalog.renditions)) {
				let className = PANEL;
				let content = `${name.split("/").pop()} ${props.describe(rendition)}`;
				if (name === active) {
					// The source's selection: the decoder may still show the old rendition until this one arrives.
					content += " · selected";
					if (error) {
						className += " ring-2 ring-red-500";
						content += ` (${error.message})`;
					} else if (switched?.to === name) {
						className += " ring-2 ring-amber-400";
					} else {
						className += " ring-2 ring-green-500";
					}
				}
				DOM.render(effect, container, DOM.create("div", { className }, content));
			}
		});
	}

	// What the tile asks of simulcast: the pixel budget its on-screen size and zoom set, and the
	// latest switch that budget and the downlink caused.
	#target(parent: Effect, container: HTMLElement, source: WatchBroadcast, switched: Getter<Switch | undefined>) {
		parent.run((effect) => {
			const pixels = effect.get(source.video.target)?.pixels;
			if (pixels === undefined) return;
			const content = `target ${(pixels / 1_000_000).toFixed(2)} MP`;
			DOM.render(effect, container, DOM.create("div", { className: PANEL }, content));
		});

		parent.run((effect) => {
			const change = effect.get(switched);
			if (!change) return;
			const label = (name: string) => name.split("/").pop();
			const content = `${change.up ? "▲" : "▼"} selected ${label(change.from)} → ${label(change.to)}`;
			const className = `${BOX} bg-amber-400 text-black font-bold`;
			DOM.render(effect, container, DOM.create("div", { className }, content));
		});
	}

	// Sparklines of what the tile's decoders received, plus the counters that explain a bad one.
	#delivery(parent: Effect, source: WatchBroadcast): HTMLElement {
		const panel = DOM.create("div", { className: `absolute bottom-1 left-1 ${PANEL} ${GRAPHS}` });

		const bitrate = graph(parent, "Video", { color: "#a855f7", format: formatBitrate });
		const fps = graph(parent, "Frame rate", { color: "#facc15", format: formatFps });
		const jitterGraph = graph(parent, "Audio jitter", { color: "#4ade80", format: formatMillis });
		const videoCounters = DOM.create("div");
		const audioCounters = DOM.create("div");
		panel.append(bitrate.el, fps.el, videoCounters, jitterGraph.el, audioCounters);

		// Feed every audio arrival the decoder reports, not just the one each poll sees.
		const jitter = new Jitter();
		parent.subscribe(source.audio.stats, (stats) => {
			if (stats?.arrival) jitter.arrive(stats.arrival.timestamp.asMillis(), stats.arrival.wall.asUnixMillis());
		});

		// Start from the counters as they stand, so turning Debug on mid-call draws no spike.
		const counters = () => {
			const video = source.video.stats.peek();
			return { when: at(), frames: video?.frameCount ?? 0, bytes: video?.bytesReceived ?? 0, video };
		};
		let previous = counters();
		parent.interval(() => {
			const current = counters();
			const elapsed = (current.when - previous.when) / 1000;

			// A decoder that restarted counts from zero, which reads as no rate rather than a negative one.
			const rate = (count: number, before: number) =>
				elapsed > 0 && count > before ? (count - before) / elapsed : undefined;
			const bytes = rate(current.bytes, previous.bytes);
			bitrate.push(bytes !== undefined ? bytes * 8 : undefined);
			fps.push(rate(current.frames, previous.frames));
			previous = current;

			const video = current.video;
			videoCounters.textContent = video
				? `late ${video.late} · stalls ${video.stalls} (${formatMillis(video.stalled.asMillis())})`
				: "no video";

			// Silence sends nothing, so it is left out of the trace rather than drawn as zero jitter.
			const late = jitter.sample();
			if (late !== undefined) jitterGraph.push(late);
			const audio = source.audio.stats.peek();
			audioCounters.textContent = audio
				? `late ${audio.late} · underruns ${audio.underruns} · skips ${audio.skips}`
				: "no audio";
		}, POLL);

		return panel;
	}

	close() {
		this.signals.close();
	}
}

/**
 * The room-wide half of the Debug HUD: the connection's PROBE round trip and receive estimate, and
 * the PROBE target every watched tile's ceiling adds up to. Observing PROBE asks the relay for
 * updates, so it is only observed while Debug is on.
 */
export class NetworkDebug {
	#connection: Moq.Connection;
	#signals = new Effect();

	constructor(connection: Moq.Connection) {
		this.#connection = connection;
		this.#signals.run(this.#render.bind(this));
	}

	#render(effect: Effect) {
		if (!effect.get(Settings.debug.tracks)) return;

		const panel = DOM.create("div", {
			className: `fixed top-20 left-2 z-[1000] pointer-events-none select-none ${PANEL} ${GRAPHS}`,
		});
		const rtt = graph(effect, "PROBE round trip", { color: "#00dfff", format: formatMillis });
		const estimate = DOM.create("div");
		const target = DOM.create("div");
		panel.append(rtt.el, estimate, target);

		effect.cleanup(this.#connection.probe.subscribe(() => {}));

		effect.interval(() => {
			const probe = this.#connection.probe.peek();
			const roundTrip = probe?.rtt;
			rtt.push(roundTrip && !roundTrip.isZero() ? roundTrip.asMillis() : undefined);

			const recv = probe?.estimatedRecvRate;
			estimate.textContent = `downlink ${recv ? formatBitrate(recv) : "-"}`;
			const wanted = this.#connection.viewers.peek()?.target.peek();
			target.textContent = `PROBE target ${wanted ? formatBitrate(wanted) : "-"}`;
		}, POLL);

		DOM.render(effect, document.body, panel);
	}

	close() {
		this.#signals.close();
	}
}
