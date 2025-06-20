import { Publish, Watch } from "@kixelated/hang";
import { Broadcast } from "./broadcast";
import { Vector } from "./geometry";
import Settings from "./settings";

// Local or remote (Hang.Watch.Video) video source.
/*
export interface VideoSource {
	active: Memo<boolean>;
	frame: (now: DOMHighResTimeStamp) => { frame: VideoFrame; lag: DOMHighResTimeStamp } | undefined;
	close: () => void;

	// Called to stop downloading when minimized, but obviously we don't want to stop publishing so it's optional.
	enabled?: Signal<boolean>;
}
	*/

export type VideoSource = Watch.Video | Publish.Video;

export class Video {
	// We don't use the Video renderer that comes with hang because it assumes a single video source.
	// So we use the Video class directly to get individual frames.
	broadcast: Broadcast;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	// The desired size of the video in pixels.
	targetSize: Vector; // in pixels

	// The opacity from 0 to 1, where 0 is offline and 1 is online.
	online = 0;

	#memeOpacity = 0;
	#nameOpacity = 0;

	constructor(broadcast: Broadcast) {
		this.broadcast = broadcast;
		this.targetSize = Vector.create(128, 128);
	}

	tick(now: DOMHighResTimeStamp) {
		const active = this.broadcast.source.video.active.peek();
		const next = this.broadcast.source.video.frame(now);

		if (active && next) {
			this.transition = Math.min(this.transition + 0.05, 1);
			this.targetSize = Vector.create(next.frame.displayWidth, next.frame.displayHeight);
		} else {
			this.transition = Math.max(this.transition - 0.05, 0);
			// TODO do this once, not on every frame.
			if (this.broadcast.avatar.complete) {
				this.targetSize = Vector.create(this.broadcast.avatar.width, this.broadcast.avatar.height);

				// If the avatar is larger than 256x256, then shrink it to match the target area.
				const ratio = Math.sqrt(this.targetSize.x * this.targetSize.y) / 256;
				if (ratio > 1) {
					this.targetSize = this.targetSize.div(ratio);
				}
			}
		}

		if (this.broadcast.online.peek()) {
			this.online += (1 - this.online) * 0.1;
		} else {
			this.online += (0 - this.online) * 0.1;
		}
	}

	// Try to avoid any mutations in this function; do it in tick instead.
	render(
		now: DOMHighResTimeStamp,
		ctx: CanvasRenderingContext2D,
		modifiers?: {
			dragging?: boolean;
			hovering?: boolean;
		},
	) {
		ctx.save();

		const bounds = this.broadcast.bounds.peek();
		const scale = this.broadcast.scale;

		ctx.translate(bounds.position.x, bounds.position.y);
		ctx.globalAlpha *= this.online;
		ctx.fillStyle = "#000";

		ctx.save();

		// Add a drop shadow
		ctx.shadowColor = "rgba(0, 0, 0, 1.0)";
		ctx.shadowBlur = 16 * scale;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 4 * scale;

		// Create a rounded rectangle path
		const radius = 32 * scale;
		const w = bounds.size.x;
		const h = bounds.size.y;

		ctx.beginPath();
		ctx.moveTo(radius, 0);
		ctx.lineTo(w - radius, 0);
		ctx.quadraticCurveTo(w, 0, w, radius);
		ctx.lineTo(w, h - radius);
		ctx.quadraticCurveTo(w, h, w - radius, h);
		ctx.lineTo(radius, h);
		ctx.quadraticCurveTo(0, h, 0, h - radius);
		ctx.lineTo(0, radius);
		ctx.quadraticCurveTo(0, 0, radius, 0);
		ctx.closePath();

		ctx.fillStyle = "#000"; // just needed to apply the shadow
		ctx.fill();

		ctx.shadowColor = "transparent";

		// Clip and draw the image
		ctx.clip();

		// Apply an opacity to the image.
		if (modifiers?.dragging) {
			ctx.globalAlpha *= 0.7;
		}

		const next = this.broadcast.source.video.frame(now);

		if (next && this.transition > 0) {
			ctx.save();
			ctx.globalAlpha *= this.transition;

			// Compute grayscale level based on how late the frame is.
			/*
			const spinner = Math.min(Math.max((lag ?? 0 - 2000) / (5000 - 2000), 0), 1)
			if (spinner > 0) {
				ctx.filter = `grayscale(${spinner})`
			}
				*/

			ctx.imageSmoothingEnabled = !Settings.potato.peek();
			ctx.drawImage(next.frame, 0, 0, bounds.size.x, bounds.size.y);
			ctx.restore();

			/*
			if (spinner > 0) {
				const spinnerSize = 32 * this.scale
				const spinnerX = bounds.size.x / 2 - spinnerSize / 2
				const spinnerY = bounds.size.y / 2 - spinnerSize / 2
				const angle = ((now % 1000) / 1000) * 2 * Math.PI

				ctx.save()
				ctx.translate(spinnerX + spinnerSize / 2, spinnerY + spinnerSize / 2)
				ctx.rotate(angle)

				ctx.beginPath()
				ctx.arc(0, 0, spinnerSize / 2 - 2, 0, Math.PI * 1.5) // crude 3/4 arc
				ctx.lineWidth = 4 * this.scale
				ctx.strokeStyle = `hsla(290, 80%, 40%, ${spinner})`
				ctx.stroke()

				ctx.restore()
			}
				*/
		}

		if (this.transition < 1) {
			ctx.save();
			ctx.globalAlpha *= 1 - this.transition;

			if (this.broadcast.avatar) {
				ctx.drawImage(this.broadcast.avatar, 0, 0, bounds.size.x, bounds.size.y);
			} else {
				ctx.fillRect(0, 0, bounds.size.x, bounds.size.y);
			}

			ctx.restore();
		}

		const meme = this.broadcast.meme.peek();
		if (meme) {
			if (meme.currentTime > 0) {
				ctx.save();
				ctx.globalAlpha *= this.#memeOpacity;

				if (meme instanceof HTMLVideoElement) {
					// Figure out the correct aspect ratio such that we fill the bounds.
					const aspectRatio = meme.videoWidth / meme.videoHeight;
					let width: number;
					let height: number;

					// Calculate dimensions to fill the bounds while maintaining aspect ratio
					if (aspectRatio > bounds.size.x / bounds.size.y) {
						// Video is wider than bounds - use height to fill
						height = bounds.size.y;
						width = height * aspectRatio;
					} else {
						// Video is taller than bounds - use width to fill
						width = bounds.size.x;
						height = width / aspectRatio;
					}

					// Center the video.
					const x = bounds.size.x / 2 - width / 2;
					const y = bounds.size.y / 2 - height / 2;

					// Add a pixel in each direction to account for any rounding errors.
					ctx.drawImage(meme, x - 1, y - 1, width + 2, height + 2);
				} else {
					const fontSize = 32 + 32 * Math.sqrt(scale);
					// Draw an audio symbol.
					ctx.fillStyle = "white";
					ctx.font = `bold ${fontSize}px Arial`;
					// Render it at the bottom center of the bounds.
					ctx.fillText("🔊", bounds.size.x / 2 - fontSize / 2, bounds.size.y - fontSize / 2);
				}

				ctx.restore();
			}

			if (meme.ended || (meme.paused && meme.currentTime > 0)) {
				this.#memeOpacity += -this.#memeOpacity * 0.1;
				if (this.#memeOpacity <= 0) {
					this.broadcast.meme.set(undefined);
				}
			} else {
				this.#memeOpacity += (1 - this.#memeOpacity) * 0.1;
			}
		}

		// Cancel the clip
		ctx.restore();

		//if (modifiers.hovering) {
		//ctx.lineWidth = 2 * this.scale;
		//ctx.strokeStyle = "white";
		//ctx.strokeRect(0, 0, bounds.size.x, bounds.size.y);
		//}

		// Render the display name when hovering.
		const targetOpacity = modifiers?.hovering ? 1 : 0;
		this.#nameOpacity += (targetOpacity - this.#nameOpacity) * 0.1;

		if (this.#nameOpacity > 0) {
			const fontSize = 10 + 12 * Math.sqrt(scale);
			ctx.save();
			ctx.globalAlpha *= this.#nameOpacity;
			ctx.font = `bold ${fontSize}px Arial`;
			ctx.fillStyle = "white";
			ctx.strokeStyle = "black";
			ctx.lineWidth = 1 + 2 * Math.sqrt(scale);
			const offset = 10 + 16 * Math.sqrt(scale);
			ctx.strokeText(this.broadcast.display.peek(), offset, 2 * offset, bounds.size.x - 2 * offset);
			ctx.fillText(this.broadcast.display.peek(), offset, 2 * offset, bounds.size.x - 2 * offset);
			ctx.restore();
		}

		// Draw target for debugging
		/*
		ctx.beginPath();
		ctx.arc(
			this.targetPosition.x * ctx.canvas.width,
			this.targetPosition.y * ctx.canvas.height,
			4 * this.scale,
			0,
			2 * Math.PI,
		);
		ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
		ctx.fill();
		*/

		ctx.restore();
	}
}
