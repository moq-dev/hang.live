import { Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import * as Api from "../api";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import { Bounds, Vector } from "./geometry";

//export type VideoSource = Watch.Video.Source | Publish.Video.Encoder;

export class Video {
	// We don't use the Video renderer that comes with hang because it assumes a single video source.
	// So we use the Video class directly to get individual frames.
	broadcast: Broadcast;

	// The avatar image.
	avatar = new Image();

	// The size of the avatar in pixels.
	avatarSize = new Signal<Vector | undefined>(undefined);

	// The desired size of the video in pixels.
	targetSize = new Signal<Vector>(Vector.create(128, 128));

	// Time-based transition tracking (in milliseconds)
	#memeTransition: DOMHighResTimeStamp = 0; // When meme started appearing/disappearing
	#frameTransition: DOMHighResTimeStamp = 0;
	frameActive: boolean = false;

	// Computed opacity values (calculated once per frame instead of per pixel)
	frameOpacity: number = 0;
	memeOpacity: number = 0;

	// Signal that updates when meme video dimensions are loaded
	#memeSize = new Signal<Vector | undefined>(undefined);

	// Cached meme bounds (x_offset, y_offset, width_scale, height_scale)
	memeBounds?: Bounds;
	memeActive: Signal<boolean> = new Signal<boolean>(false);

	// WebGL textures for this broadcast
	frameTexture: WebGLTexture; // Video texture
	avatarTexture: WebGLTexture; // Avatar texture
	memeTexture: WebGLTexture; // Meme texture
	#gl: WebGL2RenderingContext;

	// Render avatars and emojis at this size
	#renderSize = new Signal<number>(128);

	// Whether to flip the video horizontally (for self-preview)
	flip = new Signal<boolean>(false);

	constructor(broadcast: Broadcast) {
		this.broadcast = broadcast;

		this.#gl = broadcast.canvas.gl;

		// Create the textures
		this.frameTexture = this.#gl.createTexture();
		this.avatarTexture = this.#gl.createTexture();
		this.memeTexture = this.#gl.createTexture();

		// Initialize textures with 1x1 transparent pixel to make them renderable
		const emptyPixel = new Uint8Array([0, 0, 0, 0]);
		for (const texture of [this.frameTexture, this.avatarTexture, this.memeTexture]) {
			this.#gl.bindTexture(this.#gl.TEXTURE_2D, texture);
			this.#gl.texImage2D(
				this.#gl.TEXTURE_2D,
				0,
				this.#gl.RGBA,
				1,
				1,
				0,
				this.#gl.RGBA,
				this.#gl.UNSIGNED_BYTE,
				emptyPixel,
			);
			this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_S, this.#gl.CLAMP_TO_EDGE);
			this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_WRAP_T, this.#gl.CLAMP_TO_EDGE);
			this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MIN_FILTER, this.#gl.LINEAR);
			this.#gl.texParameteri(this.#gl.TEXTURE_2D, this.#gl.TEXTURE_MAG_FILTER, this.#gl.LINEAR);
		}
		this.#gl.bindTexture(this.#gl.TEXTURE_2D, null);

		// Set up texture upload effects
		this.broadcast.signals.effect(this.#runFrame.bind(this));
		this.broadcast.signals.effect(this.#runMeme.bind(this));
		this.broadcast.signals.effect(this.#runMemeBounds.bind(this));
		this.broadcast.signals.effect(this.#runAvatar.bind(this));
		this.broadcast.signals.effect(this.#runTargetSize.bind(this));
		this.broadcast.signals.effect(this.#runMemeTransition.bind(this));
		this.broadcast.signals.effect(this.#runFlip.bind(this));

		this.broadcast.signals.effect(this.#runRenderSize.bind(this));
	}

	#runFlip(effect: Effect) {
		// Flipping is a mess because there's no way to encode a flipped frame, only to decode it flipped.
		if (this.broadcast.source instanceof Publish.Broadcast) {
			const flip = effect.get(this.broadcast.source.video.hd.config)?.flip ?? false;
			this.flip.set(flip);
		} else if (this.broadcast.source instanceof Watch.Broadcast) {
			const flip = effect.get(this.broadcast.source.video.active)?.config.flip ?? false;
			this.flip.set(flip);
		}
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

		// Enable CORS for external avatar images
		newAvatar.crossOrigin = "anonymous";

		// For SVGs, load at higher resolution to avoid pixelation
		// Set a reasonable size (e.g., 512x512) for better quality
		if (avatar.endsWith(".svg")) {
			const size = effect.get(this.#renderSize);
			newAvatar.width = size;
			newAvatar.height = size;
		}

		newAvatar.src = avatar;

		// Once the avatar loads, upload it to the texture
		effect.event(newAvatar, "load", () => {
			const avatarSize = Vector.create(
				newAvatar.naturalWidth || newAvatar.width,
				newAvatar.naturalHeight || newAvatar.height,
			);
			effect.set(this.avatarSize, avatarSize);

			effect.effect((effect) => {
				const size = effect.get(this.#renderSize);
				this.#imageToTexture(newAvatar, this.avatarTexture, size);
			});
		});
	}

	#imageToTexture(src: HTMLImageElement, dst: WebGLTexture, size: number) {
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Failed to get context");
		ctx.drawImage(src, 0, 0, size, size);

		const gl = this.#gl;
		gl.bindTexture(gl.TEXTURE_2D, dst);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
		gl.bindTexture(gl.TEXTURE_2D, null);
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
		const frame = effect.get(this.broadcast.source.video.frame);

		if (!!frame !== this.frameActive) {
			this.#frameTransition = performance.now();
			this.frameActive = !!frame;
		}

		if (frame) this.#frameToTexture(frame, this.frameTexture);
	}

	#runMeme(effect: Effect) {
		const meme = effect.get(this.broadcast.meme);
		if (!meme) {
			this.memeActive.set(false);
			return;
		}

		const element = meme.element;

		effect.event(element, "ended", () => {
			this.memeActive.set(false);
		});

		if (element instanceof HTMLVideoElement) {
			this.#videoToTexture(effect, element, this.memeTexture);

			// Listen for loadedmetadata event to update meme size when dimensions are available
			const updateSize = () => {
				if (element.videoWidth > 0 && element.videoHeight > 0) {
					this.memeActive.set(true);
					effect.set(this.#memeSize, Vector.create(element.videoWidth, element.videoHeight));
				}
			};

			// Check if already loaded
			if (element.readyState >= 1) {
				updateSize();
			}

			// Listen for metadata load
			effect.event(element, "loadedmetadata", updateSize);
		} else if ("emoji" in meme.source) {
			const emoji = meme.source.emoji;

			effect.effect((effect) => {
				// Audio meme - render emoji to texture
				const size = effect.get(this.#renderSize);
				this.#emojiToTexture(emoji, size);
			});

			this.memeActive.set(true);
		}
	}

	#runMemeTransition(effect: Effect) {
		effect.get(this.memeActive);
		this.#memeTransition = performance.now();
	}

	#runMemeBounds(effect: Effect) {
		const meme = effect.get(this.broadcast.meme);
		if (!meme) return;

		// Wait until meme dimensions are available
		const memeSize = effect.get(this.#memeSize);
		if (!memeSize) return;

		// Also react to bounds changes
		const bounds = effect.get(this.broadcast.bounds);

		const fit = meme.source.fit || "cover";
		const position = meme.source.position || "center";

		// Calculate meme bounds based on fit and position
		const aspectRatio = memeSize.x / memeSize.y;
		const boundsAspectRatio = bounds.size.x / bounds.size.y;
		let width: number;
		let height: number;

		if (fit === "contain") {
			// Fit entire video within bounds
			if (aspectRatio > boundsAspectRatio) {
				width = 1.0;
				height = boundsAspectRatio / aspectRatio;
			} else {
				height = 1.0;
				width = aspectRatio / boundsAspectRatio;
			}
		} else {
			// cover: fill the bounds (may crop)
			if (aspectRatio > boundsAspectRatio) {
				height = 1.0;
				width = aspectRatio / boundsAspectRatio;
			} else {
				width = 1.0;
				height = boundsAspectRatio / aspectRatio;
			}
		}

		// Parse position string
		let xPos = 0.5;
		let yPos = 0.5;

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
				if (positionParts.length === 1) {
					xPos = value;
				} else if (positionParts.indexOf(part) === 0) {
					xPos = value;
				} else {
					yPos = value;
				}
			}
		}

		// Calculate offset in texture coordinates (0-1 range)
		this.memeBounds = new Bounds(
			Vector.create((1.0 - width) * xPos, (1.0 - height) * yPos),
			Vector.create(width, height),
		);

		effect.cleanup(() => {
			this.memeBounds = undefined;
		});
	}

	#frameToTexture(src: VideoFrame, dst: WebGLTexture) {
		const gl = this.#gl;
		gl.bindTexture(gl.TEXTURE_2D, dst);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.bindTexture(gl.TEXTURE_2D, null);
	}

	#videoToTexture(effect: Effect, src: HTMLVideoElement, dst: WebGLTexture) {
		const gl = this.#gl;

		let cancel: number;
		const onFrame = () => {
			gl.bindTexture(gl.TEXTURE_2D, dst);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.bindTexture(gl.TEXTURE_2D, null);

			if (!src.paused && !src.ended) {
				cancel = src.requestVideoFrameCallback(onFrame);
			}
		};

		cancel = src.requestVideoFrameCallback(onFrame);

		effect.cleanup(() => src.cancelVideoFrameCallback(cancel));
	}

	#emojiToTexture(emoji: string, size: number) {
		const gl = this.#gl;

		// Create offscreen canvas
		const canvas = document.createElement("canvas");
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("Failed to get context");

		// Render emoji centered
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.font = `${size * 0.5}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
		// Shift down slightly to compensate for emoji baseline issues
		ctx.fillText(emoji, size / 2, size * 0.56);

		// Upload to texture
		gl.bindTexture(gl.TEXTURE_2D, this.memeTexture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.bindTexture(gl.TEXTURE_2D, null);

		// Set meme size for bounds calculation
		this.#memeSize.set(Vector.create(size, size));
	}

	#runRenderSize(effect: Effect) {
		const scale = effect.get(Settings.render.scale);
		const target = effect.get(this.broadcast.bounds).size;
		const size = Math.sqrt(target.x * target.y) * scale;
		// Increase to the nearest power of 2
		const power = Math.ceil(Math.log2(size));
		this.#renderSize.set(Math.min(2 ** power, 512 * scale));
	}

	// Update opacity values based on current time (called once per frame)
	tick(now: DOMHighResTimeStamp) {
		const TRANSITION_DURATION = 300; // ms

		// Calculate frame opacity
		const frameElapsed = now - this.#frameTransition;
		if (this.frameActive) {
			this.frameOpacity = Math.min(1, Math.max(0, frameElapsed / TRANSITION_DURATION));
		} else {
			this.frameOpacity = Math.max(0, 1 - frameElapsed / TRANSITION_DURATION);
		}

		// Calculate meme opacity
		const memeElapsed = now - this.#memeTransition;
		if (this.memeActive.peek()) {
			this.memeOpacity = Math.min(1, Math.max(0, memeElapsed / TRANSITION_DURATION));
		} else {
			this.memeOpacity = Math.max(0, 1 - memeElapsed / TRANSITION_DURATION);
		}
	}

	close() {
		this.#gl.deleteTexture(this.frameTexture);
		this.#gl.deleteTexture(this.avatarTexture);
		this.#gl.deleteTexture(this.memeTexture);
	}
}
