import { Effect, Signal } from "@moq/signals";
import * as Api from "../api";
import Settings from "../settings";
import type { Broadcast } from "./broadcast";
import { Bounds, Vector } from "./geometry";
import * as Meme from "./meme";

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

	// Cached meme bounds (x_offset, y_offset, width_scale, height_scale)
	#memeSize = new Signal<Vector | undefined>(undefined);
	memeBounds = new Signal<Bounds | undefined>(undefined);
	memeActive: Signal<boolean> = new Signal<boolean>(false);
	memeChroma = false; // whether to use chroma key for greenscreen removal

	// WebGL textures for this broadcast
	frameTexture: WebGLTexture; // Video texture
	avatarTexture: WebGLTexture; // Avatar texture
	memeTexture: WebGLTexture; // Meme texture
	#gl: WebGL2RenderingContext;

	// Render avatars and emojis at this size
	#renderSize = new Signal<number>(128);

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
		this.broadcast.signals.run(this.#runFrame.bind(this));
		this.broadcast.signals.run(this.#runMeme.bind(this));
		this.broadcast.signals.run(this.#runMemeBounds.bind(this));
		this.broadcast.signals.run(this.#runAvatar.bind(this));
		this.broadcast.signals.run(this.#runTargetSize.bind(this));
		this.broadcast.signals.run(this.#runMemeTransition.bind(this));

		this.broadcast.signals.run(this.#runRenderSize.bind(this));
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

			effect.run((effect) => {
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
		const display = effect.get(this.broadcast.source.video.display);
		if (display) {
			this.targetSize.set(Vector.create(display.width, display.height));
			return;
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
		if (!meme) return;

		if ("element" in meme) {
			this.#runMemeVideo(effect, meme);
		} else {
			this.#runMemeEmoji(effect, meme);
		}
	}

	#runMemeVideo(effect: Effect, meme: Meme.Video) {
		const element = meme.element;

		// Monitor when the meme finishes playing, either by pausing (canceled) or ending.
		// NOTE: iOS will pause on the second <video> tag.
		// NOTE: The audio module calls play() only after connecting the the audio node.
		const paused = new Signal(element.paused);
		effect.event(element, "play", () => paused.set(false));
		effect.event(element, "pause", () => {
			if (this.broadcast.meme.peek() === meme) {
				this.broadcast.meme.set(undefined); // Signal done
			}
		});

		effect.cleanup(() => this.memeActive.set(false));

		const gl = this.#gl;

		effect.run((effect) => {
			if (effect.get(paused)) return; // Gate everything on the pause state

			let first = true;

			let cancel: number;
			const onFrame = () => {
				if (first) {
					first = false;

					// Check if the video has an alpha channel
					// This only fails on Safari currently; no support for VP9+alpha
					const frame = new VideoFrame(element);
					if (frame.format?.endsWith("A")) {
						this.memeChroma = false;
					} else {
						this.memeChroma = true;
					}
					frame.close();
				}

				// Don't render the frame until we start playing
				if (element.currentTime > 0 && element.readyState > HTMLMediaElement.HAVE_CURRENT_DATA) {
					this.memeActive.set(true);

					gl.bindTexture(gl.TEXTURE_2D, this.memeTexture);
					gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, element);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
					gl.bindTexture(gl.TEXTURE_2D, null);
				}

				if (!element.paused && !element.ended) {
					cancel = element.requestVideoFrameCallback(onFrame);
				}
			};

			cancel = element.requestVideoFrameCallback(onFrame);

			effect.cleanup(() => {
				element.cancelVideoFrameCallback(cancel);
			});

			// Listen for loadedmetadata event to update meme size when dimensions are available
			const updateSize = () => {
				if (element.videoWidth && element.videoHeight) {
					this.#memeSize.set(Vector.create(element.videoWidth, element.videoHeight));
				}
			};

			// Check if already loaded
			if (element.readyState >= 1) {
				updateSize();
			}

			// Listen for metadata load
			effect.event(element, "loadedmetadata", updateSize);
		});
	}

	#runMemeBounds(effect: Effect) {
		const meme = effect.get(this.broadcast.meme);
		if (!meme) return;

		const memeSize = effect.get(this.#memeSize);
		if (!memeSize) return;

		// Also react to bounds changes
		const bounds = effect.get(this.broadcast.bounds);

		const fit = "fit" in meme ? meme.fit : "contain";
		const position = "position" in meme ? meme.position : "center";

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
		} else if (fit === "cover") {
			// cover: fill the bounds (may crop)
			if (aspectRatio > boundsAspectRatio) {
				height = 1.0;
				width = aspectRatio / boundsAspectRatio;
			} else {
				width = 1.0;
				height = boundsAspectRatio / aspectRatio;
			}
		} else {
			throw new Error(`Unsupported fit: ${fit}`);
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
		effect.set(
			this.memeBounds,
			new Bounds(Vector.create((1.0 - width) * xPos, (1.0 - height) * yPos), Vector.create(width, height)),
		);
	}

	#runMemeEmoji(effect: Effect, meme: Meme.Audio) {
		const emoji = meme.emoji;

		this.memeChroma = false;

		effect.run((effect) => {
			// Audio meme - render emoji to texture
			const size = effect.get(this.#renderSize);
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

			this.#memeSize.set(Vector.create(size, size));
		});

		this.memeActive.set(true);
		effect.cleanup(() => this.memeActive.set(false));
	}

	#runMemeTransition(effect: Effect) {
		effect.get(this.memeActive);
		this.#memeTransition = performance.now();
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
