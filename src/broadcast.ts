import { cleanup, Signal, Signals } from "@kixelated/signals";

import { Publish, Watch, Catalog } from "@kixelated/hang";
import { Audio } from "./audio";
import { Bounds, Vector } from "./geometry";
import { Video } from "./video";

export type BroadcastSource = Watch.Broadcast | Publish.Broadcast;
/*
export interface BroadcastSource {
	audio: AudioSource;
	video: VideoSource;

	// We can both get and set the location (reactive)
	location: {
		get: () => Catalog.Position | undefined;
		set: (position: Catalog.Position) => void;
		locked?: () => boolean;
	};

	enabled: Signal<boolean>;

	close: () => void;
}
	*/

export class Broadcast<T extends BroadcastSource = BroadcastSource> {
	source: T;
	viewport: Signal<Bounds>;

	audio: Audio;
	video: Video;

	bounds: Bounds; // -canvas/2 to +canvas/2
	scale = 1.0; // 1 is 100%
	velocity = Vector.create(0, 0); // in pixels per ?

	targetPosition = Vector.create(0, 0); // -0.5 to 0.5
	targetScale = 1.0; // 1 is 100%

	// 1 when the broadcaster is online, 0 when they're offline.
	online = 1;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	avatar?: HTMLImageElement;

	#locationProducer?: Publish.LocationProducer;

	#signals = new Signals();

	constructor(
		source: T,
		viewport: Signal<Bounds>,
		locals?: {
			camera: Publish.Broadcast;
			screen: Publish.Broadcast;
		},
	) {
		this.source = source;
		this.viewport = viewport;

		this.avatar = new Image();
		this.avatar.src = "/avatar.png";

		this.video = new Video(source.video);
		this.audio = new Audio(source.audio);

		// Start them at the center of the screen with a tiiiiny bit of variance to break ties.
		const start = () => (Math.random() - 0.5) / 100;
		this.targetPosition = Vector.create(start(), start());

		const canvas = this.viewport.peek();

		// TODO This seems kinda buggy?
		const startPosition = this.targetPosition
			.normalize()
			.mult(2 * Math.sqrt(canvas.size.x ** 2 + canvas.size.y ** 2));

		this.bounds = new Bounds(startPosition, this.video.targetSize);

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

	// TODO Also make scale a signal
	tick(now: DOMHighResTimeStamp, scale: number) {
		this.video.tick(now);

		this.scale += (this.targetScale - this.scale) * 0.1;
		const targetSize = this.video.targetSize.mult(this.scale * scale);

		// Slowly move from the actual size to the target size
		this.bounds.size.x += (targetSize.x - this.bounds.size.x) * 0.1;
		this.bounds.size.y += (targetSize.y - this.bounds.size.y) * 0.1;

		// Slowly slow down the velocity.
		this.velocity = this.velocity.mult(0.5);

		const viewport = this.viewport.peek();

		// Guide the body towards the target position with a bit of force.
		const target = Vector.create(
			this.targetPosition.x * viewport.size.x,
			this.targetPosition.y * viewport.size.y,
		).mult(2);
		const middle = this.bounds.middle();
		const force = target.sub(middle);
		this.velocity = this.velocity.add(force);
	}

	// Apply velocity to the bounds.
	move() {
		this.bounds = this.bounds.add(this.velocity.div(50));
		const viewport = this.viewport.peek();

		// Pan the audio left or right based on the position.
		const pan = this.bounds.middle().x / viewport.size.x;
		this.audio.pan.set(Math.min(Math.max(pan, -1), 1));
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
