import { Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import * as Api from "../api";
import type { Broadcast } from "./broadcast";
import { FakeBroadcast } from "./fake";
import { Vector } from "./geometry";
import { MEME_AUDIO, MEME_AUDIO_LOOKUP, MEME_VIDEO, MEME_VIDEO_LOOKUP, type MemeVideoName } from "./meme";

export type VideoSource = Watch.Video.Source | Publish.Video.Encoder;

export class Video {
	// We don't use the Video renderer that comes with hang because it assumes a single video source.
	// So we use the Video class directly to get individual frames.
	broadcast: Broadcast;

	// The avatar image.
	avatar = new Image();

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	avatarTransition = 0;

	// The size of the avatar in pixels.
	avatarSize = new Signal<Vector | undefined>(undefined);

	// The current video frame.
	frame?: CanvasImageSource;

	// The desired size of the video in pixels.
	targetSize = new Signal<Vector>(Vector.create(128, 128));

	// The opacity from 0 to 1, where 0 is offline and 1 is online.
	online = 0;

	#memeOpacity = 0;
	#nameOpacity = 0;

	constructor(broadcast: Broadcast) {
		this.broadcast = broadcast;
		this.broadcast.signals.effect(this.#runAvatar.bind(this));
		this.broadcast.signals.effect(this.#runTargetSize.bind(this));
		this.broadcast.signals.effect(this.#runFrame.bind(this));
	}

	#runAvatar(effect: Effect) {
		let avatar = effect.get(this.broadcast.source.user.avatar);
		if (!avatar) {
			// Don't unset the avatar if it's already set.
			if (this.avatar) return;

			// Set a random default avatar while the user details are loading.
			avatar = Api.randomAvatar();
		}

		// TODO only set the avatar if it successfully loads
		const newAvatar = new Image();
		newAvatar.src = avatar;

		const load = () => {
			this.avatar = newAvatar;
			this.avatarSize.set(Vector.create(newAvatar.width, newAvatar.height));
		};

		effect.event(newAvatar, "load", load);
	}

	#runTargetSize(effect: Effect) {
		const catalog = effect.get(this.broadcast.source.video.catalog);

		if (catalog) {
			for (const rendition of catalog) {
				if (rendition.config.displayAspectHeight && rendition.config.displayAspectWidth) {
					this.targetSize.set(
						Vector.create(rendition.config.displayAspectWidth, rendition.config.displayAspectHeight),
					);
					return;
				}
			}
		}

		const avatar = effect.get(this.avatarSize);
		if (avatar) {
			// If the avatar is larger than 256x256, then shrink it to match the target area.
			const ratio = Math.sqrt(avatar.x * avatar.y) / 256;
			this.targetSize.set(avatar.div(ratio));
			return;
		}

		this.targetSize.set(Vector.create(128, 128));
	}

	#runFrame(effect: Effect) {
		if (this.broadcast.source instanceof FakeBroadcast) {
			// TODO FakeBroadcast should return a VideoFrame instead of a HTMLVideoElement.
			this.frame = effect.get(this.broadcast.source.video.frame);
		} else {
			const frame = effect.get(this.broadcast.source.video.frame)?.clone();
			effect.cleanup(() => frame?.close());
			this.frame = frame;
		}
	}

	tick() {
		if (this.frame) {
			this.avatarTransition = Math.min(this.avatarTransition + 0.05, 1);
		} else {
			this.avatarTransition = Math.max(this.avatarTransition - 0.05, 0);
		}

		if (this.broadcast.visible.peek()) {
			this.online += (1 - this.online) * 0.1;
		} else {
			this.online += (0 - this.online) * 0.1;
		}

		/*
		const ZOOM_SPEED = 0.005;
		this.#zoom = this.#zoom.lerp(this.#zoomTarget, ZOOM_SPEED);
		*/
	}

	// Try to avoid any mutations in this function; do it in tick instead.
	render(
		_now: DOMHighResTimeStamp,
		ctx: CanvasRenderingContext2D,
		modifiers?: {
			dragging?: boolean;
			hovering?: boolean;
		},
	) {
		ctx.save();

		const bounds = this.broadcast.bounds.peek();
		const scale = this.broadcast.zoom.peek();

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
		const radius = 12 * scale;
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

		if (this.frame && this.avatarTransition > 0) {
			ctx.save();
			ctx.globalAlpha *= this.avatarTransition;

			// Apply horizontal flip when rendering the preview.
			const flip =
				this.broadcast.source instanceof Publish.Broadcast &&
				this.broadcast.source.video.hd.config.peek()?.flip;

			if (flip) {
				ctx.save();
				ctx.scale(-1, 1);
				ctx.translate(-bounds.size.x, 0);
				ctx.drawImage(this.frame, 0, 0, bounds.size.x, bounds.size.y);
				ctx.restore();
			} else {
				ctx.drawImage(this.frame, 0, 0, bounds.size.x, bounds.size.y);
			}
			ctx.restore();
		}

		if (this.avatarTransition < 1) {
			ctx.save();
			ctx.globalAlpha *= 1 - this.avatarTransition;

			if (this.avatar.complete) {
				ctx.drawImage(this.avatar, 0, 0, bounds.size.x, bounds.size.y);
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
					// Get the meme configuration
					const memeName = this.broadcast.memeName.peek();
					let fit: "contain" | "cover" = "cover"; // default
					let position = "center"; // default

					if (memeName) {
						// Remove hyphens for lookup if needed
						const lookupKey = memeName.toLowerCase().replace(/-/g, "");
						const memeKey = MEME_VIDEO_LOOKUP[lookupKey] || memeName;
						const memeData = MEME_VIDEO[memeKey as MemeVideoName];
						if (memeData) {
							fit = memeData.fit || "cover";
							position = memeData.position || "center";
						}
					}

					const aspectRatio = meme.videoWidth / meme.videoHeight;
					const boundsAspectRatio = bounds.size.x / bounds.size.y;
					let width: number;
					let height: number;

					if (fit === "contain") {
						// Fit entire video within bounds (may have letterbox/pillarbox)
						if (aspectRatio > boundsAspectRatio) {
							// Video is wider than bounds - fit by width
							width = bounds.size.x;
							height = width / aspectRatio;
						} else {
							// Video is taller than bounds - fit by height
							height = bounds.size.y;
							width = height * aspectRatio;
						}
					} else {
						// cover: fill the bounds (may crop)
						if (aspectRatio > boundsAspectRatio) {
							// Video is wider than bounds - use height to fill
							height = bounds.size.y;
							width = height * aspectRatio;
						} else {
							// Video is taller than bounds - use width to fill
							width = bounds.size.x;
							height = width / aspectRatio;
						}
					}

					// Parse position string (e.g., "center", "bottom", "bottom left", "50% 75%")
					let xPos = 0.5; // default center
					let yPos = 0.5; // default center

					const positionParts = position.toLowerCase().split(/\s+/);
					for (const part of positionParts) {
						if (part === "left") xPos = 0;
						else if (part === "right") xPos = 1;
						else if (part === "top") yPos = 0;
						else if (part === "bottom") yPos = 1;
						else if (part === "center") {
							// Keep defaults
						} else if (part.endsWith("%")) {
							const value = parseFloat(part) / 100;
							// Determine if this is x or y based on what we've seen
							if (positionParts.length === 1) {
								xPos = value; // Single value applies to x
							} else if (positionParts.indexOf(part) === 0) {
								xPos = value; // First value is x
							} else {
								yPos = value; // Second value is y
							}
						}
					}

					// Calculate position based on alignment
					const x = (bounds.size.x - width) * xPos;
					const y = (bounds.size.y - height) * yPos;

					// Add a pixel in each direction to account for any rounding errors.
					ctx.drawImage(meme, x - 1, y - 1, width + 2, height + 2);
				} else {
					// Get the emoji for this audio meme
					const memeName = this.broadcast.memeName.peek();
					let emoji = "🔊"; // Default speaker emoji

					if (memeName) {
						// Remove hyphens for lookup if needed
						const lookupKey = memeName.toLowerCase().replace(/-/g, "");
						const memeKey = MEME_AUDIO_LOOKUP[lookupKey] || memeName;
						const memeData = MEME_AUDIO[memeKey as keyof typeof MEME_AUDIO];
						if (memeData) {
							emoji = memeData.emoji;
						}
					}

					const fontSize = Math.round(32 + 32 * scale); // round to avoid busting font caches
					// Draw the emoji for this audio meme
					ctx.font = `bold ${fontSize}px Arial`;
					ctx.fillStyle = "white";
					// Render it at the bottom center of the bounds.
					ctx.fillText(emoji, bounds.size.x / 2 - fontSize / 2, bounds.size.y - fontSize / 2);
				}

				ctx.restore();
			}

			if (meme.ended || (meme.paused && meme.currentTime > 0)) {
				this.#memeOpacity += -this.#memeOpacity * 0.1;
				if (this.#memeOpacity <= 0) {
					this.broadcast.meme.set(undefined);
					this.broadcast.memeName.set(undefined);
				}
			} else {
				this.#memeOpacity += (1 - this.#memeOpacity) * 0.1;
			}
		}

		// Cancel the clip
		ctx.restore();

		// Render the display name when hovering.
		const targetOpacity = modifiers?.hovering ? 1 : 0;
		this.#nameOpacity += (targetOpacity - this.#nameOpacity) * 0.1;

		const name = this.broadcast.source.user.name.peek();

		if (this.#nameOpacity > 0 && name) {
			const fontSize = Math.round(Math.max(14 * scale, 10));
			ctx.save();
			ctx.globalAlpha *= this.#nameOpacity;
			ctx.font = `bold ${fontSize}px Arial`;
			ctx.fillStyle = "white";
			ctx.strokeStyle = "black";
			ctx.lineWidth = 2 * scale;
			const offset = 12 * scale;
			ctx.strokeText(name, offset, 2 * offset, bounds.size.x - 2 * offset);
			ctx.fillText(name, offset, 2 * offset, bounds.size.x - 2 * offset);
			ctx.restore();
		}

		ctx.restore();
	}
}
