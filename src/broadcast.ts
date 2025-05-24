import { Signals } from "@kixelated/signals"
import { Watch } from "@kixelated/hang"

import { Bounds } from "./bounds"
import { Vector } from "./vector"
import { Audio } from "./audio"
import { Video } from "./video"

export class Broadcast {
	watch: Watch.Broadcast

	audio: Audio
	video: Video

	bounds: Bounds
	scale = 1.0; // 1 is 100%
	velocity = Vector.create(0, 0); // in pixels per ?

	targetPosition = Vector.create(0.5, 0.5); // in 0-1
	targetScale = 1.0; // 1 is 100%
	targetSize: Vector // in pixels

	// 1 when the broadcaster is online, 0 when they're offline.
	online = 1;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	avatar?: HTMLImageElement

	#signals = new Signals();

	constructor(watch: Watch.Broadcast) {
		this.watch = watch

		this.avatar = new Image()
		this.avatar.src = "/avatar.png"

		this.video = new Video(watch.video, watch.path.peek())
		this.audio = new Audio(watch.audio)

		this.targetSize = Vector.create(128, 128)
		this.bounds = new Bounds(Vector.create(0, 0), this.targetSize)
	}

	tick(now: DOMHighResTimeStamp, canvas: Bounds, scale: number) {
		this.video.tick(now)

		this.scale += (this.targetScale - this.scale) * 0.1
		const targetSize = this.targetSize.mult(this.scale * scale)

		// Slowly move from the actual size to the target size
		this.bounds.size.x += (targetSize.x - this.bounds.size.x) * 0.1
		this.bounds.size.y += (targetSize.y - this.bounds.size.y) * 0.1

		// Slowly slow down the velocity.
		this.velocity = this.velocity.mult(0.5)

		// Guide the body towards the target position with a bit of force.
		const target = Vector.create(
			this.targetPosition.x * canvas.size.x,
			this.targetPosition.y * canvas.size.y,
		)

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

		// Update the target size based on if we're showing a video frame or an avatar.
		const active = this.video.watch.selected.peek()

		// Check if the frame size has changed.
		if (active && this.video.frame) {
			this.targetSize = Vector.create(this.video.frame.displayWidth, this.video.frame.displayHeight)
		} else if (this.video.avatar.complete) {
			this.targetSize = Vector.create(this.video.avatar.width, this.video.avatar.height)
		}
	}

	// Apply velocity to the bounds.
	update(canvas: Bounds) {
		this.bounds = this.bounds.add(this.velocity.div(50))

		// Pan the audio left or right based on the position.
		const pan = (2 * this.bounds.middle().x) / canvas.size.x - 1
		this.audio.pan.set(Math.min(Math.max(pan, -1), 1))
	}

	rip() {
		this.targetPosition = Vector.create(Math.random(), Math.random())
	}

	close() {
		this.#signals.close()
		this.watch.close()
		this.video.close()
		this.audio.close()
	}
}
