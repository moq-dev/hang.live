import { Signal, Signals } from "@kixelated/signals"

import { Bounds, Vector } from "./geometry"
import { Audio, AudioSource } from "./audio"
import { Video, VideoSource } from "./video"
import { Catalog } from "@kixelated/hang"

export interface BroadcastSource {
	audio: AudioSource
	video: VideoSource

	// We can both get and set the location (reactive)
	location: {
		get: () => Catalog.Position | undefined
		set: (position: Catalog.Position) => void
	},
	enabled: Signal<boolean>

	close: () => void
}

export class Broadcast {
	source: BroadcastSource
	viewport: Signal<Bounds>

	audio: Audio
	video: Video

	bounds: Bounds // -canvas/2 to +canvas/2
	scale = 1.0; // 1 is 100%
	velocity = Vector.create(0, 0); // in pixels per ?

	targetPosition = Vector.create(0, 0); // -0.5 to 0.5
	targetScale = 1.0; // 1 is 100%

	// 1 when the broadcaster is online, 0 when they're offline.
	online = 1;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	avatar?: HTMLImageElement

	#signals = new Signals();

	constructor(source: BroadcastSource, viewport: Signal<Bounds>) {
		this.source = source
		this.viewport = viewport

		this.avatar = new Image()
		this.avatar.src = "/avatar.png"

		this.video = new Video(source.video)
		this.audio = new Audio(source.audio)

		// Start them at the center of the screen with a tiiiiny bit of variance.
		const start = () => (Math.random() - 0.5) / 2
		this.targetPosition = Vector.create(start(), start())

		const canvas = this.viewport.peek()

		// TODO This seems kinda buggy?
		const startPosition = this.targetPosition
			.normalize()
			.mult(2 * Math.sqrt(canvas.size.x ** 2 + canvas.size.y ** 2))

		this.bounds = new Bounds(startPosition, this.video.targetSize)

		// Load the broadcaster's position from the network.
		this.#signals.effect(() => {
			if (!this.source.enabled.get()) {
				// Change the target position to somewhere outside the screen.
				this.targetPosition = this.targetPosition
					.normalize()
					.mult(2)

				return
			}

			// Update the target position from the network.
			const location = this.source.location.get()
			if (!location) return

			this.targetPosition = Vector.create(location.x, location.y)
		})
	}

	// TODO Also make scale a signal
	tick(now: DOMHighResTimeStamp, scale: number) {
		this.video.tick(now)

		this.scale += (this.targetScale - this.scale) * 0.1
		const targetSize = this.video.targetSize.mult(this.scale * scale)

		// Slowly move from the actual size to the target size
		this.bounds.size.x += (targetSize.x - this.bounds.size.x) * 0.1
		this.bounds.size.y += (targetSize.y - this.bounds.size.y) * 0.1

		// Slowly slow down the velocity.
		this.velocity = this.velocity.mult(0.5)

		const viewport = this.viewport.peek()

		// Guide the body towards the target position with a bit of force.
		const target = Vector.create(
			this.targetPosition.x * viewport.size.x,
			this.targetPosition.y * viewport.size.y,
		).mult(2)
		const middle = this.bounds.middle()
		const force = target.sub(middle)
		this.velocity = this.velocity.add(force)

		// Bounce off the edges of the canvas.
		/*
		const left = this.bounds.position.x;
		const right = this.bounds.position.x + this.bounds.size.x;
		const top = this.bounds.position.y;
		const bottom = this.bounds.position.y + this.bounds.size.y;

		if (left < 0) {
			this.velocity.x += -left;
		} else if (right > canvas.size.x) {
			this.velocity.x += canvas.size.x - right;
		}

		if (top < 0) {
			this.velocity.y += -top;
		} else if (bottom > canvas.size.y) {
			this.velocity.y += canvas.size.y - bottom;
		}
		*/
	}

	// Apply velocity to the bounds.
	move() {
		this.bounds = this.bounds.add(this.velocity.div(50))
		const viewport = this.viewport.peek()

		// Pan the audio left or right based on the position.
		const pan = this.bounds.middle().x / viewport.size.x
		this.audio.pan.set(Math.min(Math.max(pan, -1), 1))
	}

	close() {
		this.#signals.close()
		this.source.close()
		this.video.close()
		this.audio.close()
	}
}
