import { cleanup, signal, Signal, Signals } from "@kixelated/signals";

import { Publish, Watch, Catalog, Container } from "@kixelated/hang";
import { Audio } from "./audio";
import { Bounds, Vector } from "./geometry";
import { Video } from "./video";
import { ChatMessage } from "@kixelated/hang/container";

import DOMPurify from "dompurify";
import { marked } from "marked";

export type BroadcastSource = Watch.Broadcast | Publish.Broadcast;

// Create a markdown renderer that opens links in a new tab.
const renderer = new marked.Renderer();

renderer.link = ({ href, title, text }) => {
	const t = title ? ` title="${title}"` : "";
	const safeHref = href ?? "#";
	// Important: target="_blank" rel="noopener noreferrer"
	return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${t}>${text}</a>`;
};

marked.use({ renderer });

export class Broadcast<T extends BroadcastSource = BroadcastSource> {
	source: T;

	// The canvas size, 0 to width/height.
	viewport: Signal<Vector>;

	audio: Audio;
	video: Video;

	bounds: Signal<Bounds>; // 0 to canvas
	scale = 1.0; // 1 is 100%
	velocity = Vector.create(0, 0); // in pixels per ?

	targetPosition = Vector.create(0, 0); // -0.5 to 0.5, sent over the network
	targetScale = 1.0; // 1 is 100%

	// 1 when the broadcaster is online, 0 when they're offline.
	online = 1;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	avatar?: HTMLImageElement;

	// Returns the most recent chat messages.
	messages: Signal<ChatMessage[]>;

	#locationProducer?: Publish.LocationProducer;

	#signals = new Signals();

	constructor(
		source: T,
		viewport: Signal<Vector>,
		locals?: {
			camera: Publish.Broadcast;
			screen: Publish.Broadcast;
		},
	) {
		this.source = source;
		this.viewport = viewport;
		this.messages = signal<ChatMessage[]>([]);

		this.video = new Video(this);
		this.audio = new Audio(this);

		// Start them at the center of the screen with a tiiiiny bit of variance to break ties.
		const start = () => (Math.random() - 0.5) / 100;
		this.targetPosition = Vector.create(start(), start());

		const canvas = this.viewport.peek();

		// TODO This seems kinda buggy?
		const startPosition = this.targetPosition.normalize().mult(canvas.length()).add(canvas.div(2));

		this.bounds = signal(new Bounds(startPosition, this.video.targetSize));

		// Load the broadcaster's position from the network.
		this.#signals.effect(() => {
			if (!this.source.enabled.get()) {
				// Change the target position to somewhere outside the screen.
				this.targetPosition = this.targetPosition.normalize().mult(2);

				return;
			}

			// Update the target position from the network.
			const location = this.source.location.current.get();
			if (!location) return;

			this.targetPosition.x = location.x ?? this.targetPosition.x;
			this.targetPosition.y = location.y ?? this.targetPosition.y;
			this.targetScale = location.zoom ?? this.targetScale;
		});

		this.#signals.effect(() => {
			const user = this.source.user.get();
			if (!user) return;

			this.avatar = new Image();
			this.avatar.src = user.avatar ?? "/avatar.png";

			cleanup(() => {
				this.avatar = undefined;
			});
		});

		this.#signals.effect(() => {
			if (!this.source.chat.enabled.get()) return;
			const consumer = this.source.chat.consume();
			void this.#runChat(consumer);
		});

		// If this is a remote broadcast, we need to reflect position updates via local broadcasts.
		if (locals && this.source instanceof Watch.Broadcast) {
			this.#initRemote(this.source, locals);
		}
	}

	// Special logic for only remote broadcasts.
	#initRemote(
		remote: Watch.Broadcast,
		locals: {
			camera: Publish.Broadcast;
			screen: Publish.Broadcast;
		},
	) {
		const cameraUpdates = remote.location.peer();
		this.#signals.cleanup(() => cameraUpdates.close());

		const screenUpdates = remote.location.peer();
		this.#signals.cleanup(() => screenUpdates.close());

		// Update the handle when our path changes.
		this.#signals.effect(() => {
			cameraUpdates.handle.set(locals.camera.path.get());
			screenUpdates.handle.set(locals.screen.path.get());
		});

		// Request the position we should use from this remote broadcast.
		this.#signals.effect(() => {
			// Only update the camera position if the local broadcast allows it.
			if (!locals.camera.location.peering.get()) return;

			const position = cameraUpdates.location.get();
			if (!position) return;

			locals.camera.location.current.set(position);
		});

		this.#signals.effect(() => {
			// Only update the camera position if the local broadcast allows it.
			if (!locals.camera.location.peering.get()) return;

			const position = screenUpdates.location.get();
			if (!position) return;

			locals.screen.location.current.set(position);
		});

		// Create a new peer handle so we can publish updates if allowed.
		const peer = locals.camera.location.peer();
		this.#signals.cleanup(() => peer.close());

		this.#signals.effect(() => {
			// Make sure we're actually publishing.
			if (!locals.camera.published.get()) return;

			// Only set the handle if the broadcast allows peering.
			if (!this.source.location.peering.get()) return;

			peer.handle.set(this.source.path.get());
			cleanup(() => peer.handle.set(undefined));
		});
	}

	async #runChat(decoder: Container.ChatDecoder) {
		try {
			for (;;) {
				const message = await decoder.readMessage();
				if (!message) break;

				// Convert markdown to HTML.
				// TODO: Run in a web worker to prevent DoS attacks apparently?
				const markdown = marked.parse(message.text, { async: false });

				// Sanitize the resulting HTML.
				// ChatGPT says that allowing target is ONLY safe with noopener noreferrer,
				message.text = DOMPurify.sanitize(markdown, { ADD_ATTR: ["target", "rel"] });

				this.messages.set((messages) => [message, ...messages]);

				// Remove from the DOM after the max fade time.
				setTimeout(() => {
					this.messages.set((messages) => messages.slice(0, -1));
				}, 9000);
			}
		} finally {
			this.messages.set([]);
		}
	}

	// TODO Also make scale a signal
	tick(now: DOMHighResTimeStamp, scale: number) {
		this.video.tick(now);

		const bounds = this.bounds.peek().clone(); //  clone is needed so SolidJS can track changes
		const viewport = this.viewport.peek();

		// Guide the body towards the target position with a bit of force.
		const target = Vector.create(this.targetPosition.x * viewport.x, this.targetPosition.y * viewport.y).add(
			viewport.div(2),
		);

		// Make sure the target position is within the viewport.
		target.x = Math.max(0, Math.min(target.x, viewport.x));
		target.y = Math.max(0, Math.min(target.y, viewport.y));

		const middle = this.bounds.peek().middle();
		const force = target.sub(middle);
		this.velocity = this.velocity.add(force);

		const PADDING = 64;

		const top = PADDING - bounds.position.y;
		const down = bounds.position.y + bounds.size.y - viewport.y + PADDING;
		const left = PADDING - bounds.position.x;
		const right = bounds.position.x + bounds.size.x - viewport.x + PADDING;

		if (top > 0) {
			if (down > 0) {
				// Do nothing, this element is huge.
			} else {
				this.velocity.y += top;
			}
		} else if (down > 0) {
			this.velocity.y -= down;
		}

		if (left > 0) {
			if (right > 0) {
				// Do nothing, this element is huge.
			} else {
				this.velocity.x += left;
			}
		} else if (right > 0) {
			this.velocity.x -= right;
		}

		// Apply everything now.
		const targetSize = this.video.targetSize.mult(this.scale * scale);
		this.scale += (this.targetScale - this.scale) * 0.1;

		// Apply the velocity.
		bounds.position = bounds.position.add(this.velocity.div(50));

		// Slowly move from the actual size to the target size.
		bounds.size.x += (targetSize.x - bounds.size.x) * 0.1;
		bounds.size.y += (targetSize.y - bounds.size.y) * 0.1;

		this.bounds.set(bounds);

		// Pan the audio left or right based on the position.
		// If a broadcast is visible, then it will be between -0.5 and 0.5.
		const pan = bounds.middle().x / viewport.x - 0.5;
		this.audio.pan.set(Math.min(Math.max(pan, -1), 1));

		// Slow down the velocity for the next frame.
		this.velocity = this.velocity.mult(0.5);
	}

	// Returns true if the broadcaster is locked to a position.
	locked(): boolean {
		if (this.source instanceof Watch.Broadcast) {
			return !this.source.location.peering.get();
		}

		return false;
	}

	setLocation(position: Catalog.Position) {
		if (this.source instanceof Publish.Broadcast) {
			this.source.location.current.set(position);
		} else if (this.#locationProducer) {
			this.#locationProducer.update(position);
		}
	}

	close() {
		this.#signals.close();
		this.source.close();
		this.video.close();
		this.audio.close();
	}
}
