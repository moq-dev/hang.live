import { Watch, Publish } from "@kixelated/hang";
import { Signals } from "@kixelated/signals";
import { Bounds, Vector } from "./geometry";

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
	source: VideoSource;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	avatar: HTMLImageElement;

	// The desired size of the video in pixels.
	targetSize: Vector; // in pixels

	#locator?: DOMHighResTimeStamp;

	#signals = new Signals();

	constructor(source: VideoSource) {
		this.source = source;

		this.targetSize = Vector.create(128, 128);

		this.avatar = new Image();
		this.avatar.src = "/avatar.png";
	}

	tick(now: DOMHighResTimeStamp) {
		const active = this.source.active.peek();
		const next = this.source.frame(now);

		if (active && next) {
			this.transition = Math.min(this.transition + 0.05, 1);
			this.targetSize = Vector.create(next.frame.displayWidth, next.frame.displayHeight);
		} else {
			this.transition = Math.max(this.transition - 0.05, 0);
			if (this.avatar.complete) {
				this.targetSize = Vector.create(this.avatar.width, this.avatar.height);
			}
		}
	}

	// Try to avoid any mutations in this function; do it in tick instead.
	render(
		now: DOMHighResTimeStamp,
		ctx: CanvasRenderingContext2D,
		bounds: Bounds,
		scale: number,
		modifiers?: {
			dragging?: boolean;
			hovering?: boolean;
		},
	) {
		ctx.save();

		// Add a drop shadow
		ctx.shadowColor = "rgba(0, 0, 0, 1.0)";
		ctx.shadowBlur = 16 * scale;
		ctx.shadowOffsetX = 0;
		ctx.shadowOffsetY = 4 * scale;

		ctx.translate(bounds.position.x + ctx.canvas.width / 2, bounds.position.y + ctx.canvas.height / 2);
		ctx.fillStyle = "#000";

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

		const next = this.source.frame(now);

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

			ctx.imageSmoothingEnabled = true;
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

			if (this.avatar.complete) {
				ctx.drawImage(this.avatar, 0, 0, bounds.size.x, bounds.size.y);
			} else {
				ctx.fillRect(0, 0, bounds.size.x, bounds.size.y);
			}

			ctx.restore();
		}

		//if (modifiers.hovering) {
		//ctx.lineWidth = 2 * this.scale;
		//ctx.strokeStyle = "white";
		//ctx.strokeRect(0, 0, bounds.size.x, bounds.size.y);
		//}

		ctx.restore();

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
	}

	close() {
		this.#signals.close();
		this.source.close();
	}

	renderLocator(now: DOMHighResTimeStamp, ctx: CanvasRenderingContext2D, bounds: Bounds, scale: number) {
		if (!this.#locator && this.source.active.peek()) {
			this.#locator = now;
		}

		const elapsed = now - (this.#locator ?? 0);
		const alpha = Math.min(Math.max((7000 - elapsed) / (10000 - 8000), 0), 1);
		if (alpha <= 0) {
			return;
		}

		ctx.save();
		ctx.globalAlpha *= alpha;

		// Calculate arrow position and animation
		const arrowSize = 16 * scale;
		const pulseScale = 1 + Math.sin(now / 500) * 0.1; // Subtle pulsing effect
		const offset = 10 * scale;

		const gap = 2 * (arrowSize + offset);

		const x = Math.min(Math.max(bounds.position.x + bounds.size.x / 2 + ctx.canvas.width / 2, 0), ctx.canvas.width);
		const y = Math.min(Math.max(bounds.position.y + ctx.canvas.height / 2, 2 * gap), ctx.canvas.height);

		ctx.translate(x, y - gap);
		ctx.scale(pulseScale, pulseScale);

		ctx.beginPath();
		ctx.moveTo(0, arrowSize);
		ctx.lineTo(-arrowSize / 2, 0);
		ctx.lineTo(arrowSize / 2, 0);
		ctx.closePath();

		// Style the arrow
		ctx.lineWidth = 3 * scale;
		ctx.strokeStyle = "#000"; // Gold color
		ctx.fillStyle = "#FFD700";
		ctx.stroke();
		ctx.fill();

		// Draw "YOU" text
		ctx.font = `bold ${24 * scale}px Arial`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "#FFD700";
		ctx.strokeText("YOU", 0, -arrowSize - offset);
		ctx.fillText("YOU", 0, -arrowSize - offset);

		/*
		// Add a subtle glow effect
		ctx.shadowColor = "#FFD700";
		ctx.shadowBlur = 10 * scale;
		ctx.stroke();
		*/

		ctx.restore();
	}
}
