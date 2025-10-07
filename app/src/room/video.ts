import { Effect, Signal } from "@kixelated/signals";
import * as Api from "../api";
import type { Broadcast } from "./broadcast";
import { FakeBroadcast } from "./fake";
import { Bounds, Vector } from "./geometry";
import { MEME_VIDEO, MEME_VIDEO_LOOKUP, type MemeVideoName } from "./meme";

//export type VideoSource = Watch.Video.Source | Publish.Video.Encoder;

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

	// The desired size of the video in pixels.
	targetSize = new Signal<Vector>(Vector.create(128, 128));

	// The opacity from 0 to 1, where 0 is offline and 1 is online.
	online = 0;

	#memeOpacity = 0;

	// Signal that updates when meme video dimensions are loaded
	#memeSize = new Signal<Vector | undefined>(undefined);

	// Cached meme bounds (x_offset, y_offset, width_scale, height_scale)
	memeBounds?: Bounds;

	// WebGL textures for this broadcast
	webcamTexture: WebGLTexture; // Video texture
	avatarTexture: WebGLTexture; // Avatar texture
	memeTexture: WebGLTexture; // Meme texture
	#gl: WebGL2RenderingContext;

	constructor(broadcast: Broadcast) {
		this.broadcast = broadcast;

		this.#gl = broadcast.canvas.gl;

		// Create the textures
		this.webcamTexture = this.#gl.createTexture();
		this.avatarTexture = this.#gl.createTexture();
		this.memeTexture = this.#gl.createTexture();

		// Set up texture upload effects
		this.broadcast.signals.effect(this.#runWebcam.bind(this));
		this.broadcast.signals.effect(this.#runMeme.bind(this));
		this.broadcast.signals.effect(this.#runMemeBounds.bind(this));
		this.broadcast.signals.effect(this.#runAvatar.bind(this));
		this.broadcast.signals.effect(this.#runTargetSize.bind(this));
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

		// For SVGs, load at higher resolution to avoid pixelation
		// Set a reasonable size (e.g., 512x512) for better quality
		if (avatar.endsWith(".svg")) {
			// TODO Automatically adjust?
			newAvatar.width = 512;
			newAvatar.height = 512;
		}

		newAvatar.src = avatar;

		// Once the avatar loads, upload it to the texture
		effect.event(newAvatar, "load", this.#uploadAvatar.bind(this, newAvatar));
	}

	#uploadAvatar(avatar: HTMLImageElement) {
		this.avatar = avatar;
		this.avatarSize.set(Vector.create(avatar.naturalWidth || avatar.width, avatar.naturalHeight || avatar.height));

		const gl = this.#gl;
		gl.bindTexture(gl.TEXTURE_2D, this.avatarTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, avatar);
		gl.generateMipmap(gl.TEXTURE_2D);
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

	#runWebcam(effect: Effect) {
		if (this.broadcast.source instanceof FakeBroadcast) {
			// TODO FakeBroadcast should return a VideoFrame instead of a HTMLVideoElement.
			const video = effect.get(this.broadcast.source.video.frame);
			if (!video) return;
			this.#videoToTexture(effect, video, this.webcamTexture);
		} else {
			const frame = effect.get(this.broadcast.source.video.frame);
			if (!frame) return;
			this.#frameToTexture(frame, this.webcamTexture);
		}
	}

	#runMeme(effect: Effect) {
		const meme = effect.get(this.broadcast.meme);
		if (!meme) return;

		// Only handle video memes (audio memes are just sound effects)
		if (!(meme instanceof HTMLVideoElement)) return;

		this.#videoToTexture(effect, meme, this.memeTexture);

		// Listen for loadedmetadata event to update meme size when dimensions are available
		const updateSize = () => {
			if (meme.videoWidth > 0 && meme.videoHeight > 0) {
				effect.set(this.#memeSize, Vector.create(meme.videoWidth, meme.videoHeight));
			}
		};

		// Check if already loaded
		if (meme.readyState >= 1) {
			updateSize();
		}

		// Listen for metadata load
		effect.event(meme, "loadedmetadata", updateSize);
	}

	#runMemeBounds(effect: Effect) {
		const meme = effect.get(this.broadcast.meme);
		if (!meme || !(meme instanceof HTMLVideoElement)) return;

		// Wait until meme dimensions are available
		const memeSize = effect.get(this.#memeSize);
		if (!memeSize) return;

		// Also react to bounds changes
		const bounds = effect.get(this.broadcast.bounds);

		// Get meme configuration
		const memeName = effect.get(this.broadcast.memeName);
		let fit: "contain" | "cover" = "cover";
		let position = "center";

		if (memeName) {
			const lookupKey = memeName.toLowerCase().replace(/-/g, "");
			const memeKey = MEME_VIDEO_LOOKUP[lookupKey] || memeName;
			const memeData = MEME_VIDEO[memeKey as MemeVideoName];
			if (memeData) {
				fit = memeData.fit || "cover";
				position = memeData.position || "center";
			}
		}

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

	tick() {
		if (this.broadcast.source.video.frame.peek()) {
			this.avatarTransition = Math.min(this.avatarTransition + 0.05, 1);
		} else {
			this.avatarTransition = Math.max(this.avatarTransition - 0.05, 0);
		}

		if (this.broadcast.visible.peek()) {
			this.online += (1 - this.online) * 0.1;
		} else {
			this.online += (0 - this.online) * 0.1;
		}

		// Update meme opacity
		const meme = this.broadcast.meme.peek();
		if (meme) {
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

		/*
		const ZOOM_SPEED = 0.005;
		this.#zoom = this.#zoom.lerp(this.#zoomTarget, ZOOM_SPEED);
		*/
	}

	get memeOpacity(): number {
		return this.#memeOpacity;
	}

	close() {
		this.#gl.deleteTexture(this.webcamTexture);
		this.#gl.deleteTexture(this.avatarTexture);
		this.#gl.deleteTexture(this.memeTexture);
	}
}
