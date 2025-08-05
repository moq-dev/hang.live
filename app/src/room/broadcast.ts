import * as Api from "@hang/api/client";
import { type Catalog, Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { Audio, type AudioProps } from "./audio";
import { Canvas } from "./canvas";
import { Chat } from "./chat";
import { FakeBroadcast } from "./fake";
import { Bounds, Vector } from "./geometry";
import { loadMeme } from "./meme";
import { Video } from "./video";

export type BroadcastSource = Watch.Broadcast | Publish.Broadcast | FakeBroadcast;

export type ChatMessage = {
	audio?: HTMLAudioElement;
	video?: HTMLVideoElement;
	element: Node;
	received: DOMHighResTimeStamp;
	expires: DOMHighResTimeStamp;
};

// Create a markdown renderer that opens links in a new tab.
const renderer = new marked.Renderer();

renderer.link = ({ href, title, text }) => {
	const t = title ? ` title="${title}"` : "";
	const safeHref = href ?? "#";
	// Important: target="_blank" rel="noopener noreferrer"
	return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${t}>${text}</a>`;
};

marked.use({ renderer });

export type BroadcastProps = {
	audio?: AudioProps;

	position?: Catalog.Position;
	camera?: Publish.Broadcast;
	screen?: Publish.Broadcast;

	online?: boolean;
};

// Catalog.Position but all fields are required.
type Position = {
	x: number;
	y: number;
	z: number;
	scale: number;
};

export class Broadcast<T extends BroadcastSource = BroadcastSource> {
	source: T;
	canvas: Canvas;

	audio: Audio;
	video: Video;
	chat: Chat;

	// The current chat message, if any.
	message = new Signal<DocumentFragment | undefined>(undefined);

	bounds: Signal<Bounds>; // 0 to canvas
	scale = 1.0; // 1 is 100%
	velocity = Vector.create(0, 0); // in pixels per ?

	// Replaced by position
	//targetPosition = Vector.create(0, 0); // -0.5 to 0.5, sent over the network
	//targetScale = 1.0; // 1 is 100%

	online: Signal<boolean>;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	avatar = new Image();

	// The target position of the broadcast, while bounds contains the actual position.
	// This is separate from the source.location.current so we can temporarily use our own value.
	// After we learn the real position over the network, we'll replace it.
	targetPosition: Signal<Position>;

	// The meme video/audio we're rendering, if any.
	meme = new Signal<HTMLVideoElement | HTMLAudioElement | undefined>(undefined);

	#locationPeer?: Publish.LocationPeer;

	signals = new Effect();

	// Show a locator arrow for 8 seconds to show our position on join.
	#locatorStart?: DOMHighResTimeStamp;

	constructor(source: T, canvas: Canvas, props?: BroadcastProps) {
		this.source = source;
		this.canvas = canvas;
		this.online = new Signal(props?.online ?? true);

		// Unless provided, start them at the center of the screen with a tiiiiny bit of variance to break ties.
		const start = () => (Math.random() - 0.5) / 100;
		const position = {
			x: props?.position?.x ?? start(),
			y: props?.position?.y ?? start(),
			z: props?.position?.z ?? 0,
			scale: props?.position?.scale ?? 1,
		};

		this.targetPosition = new Signal(position);

		this.video = new Video(this);
		this.audio = new Audio(this, props?.audio);
		this.chat = new Chat(this, canvas);

		// Actually start the
		// TODO This seems kinda buggy?
		const viewport = this.canvas.viewport.peek();
		const startPosition = Vector.create(position.x, position.y)
			.normalize()
			.mult(viewport.length())
			.add(viewport.div(2));
		this.bounds = new Signal(new Bounds(startPosition, this.video.targetSize));

		// Load the broadcaster's position from the network.
		this.signals.effect((effect) => {
			if (!effect.get(this.source.enabled)) {
				// Change the target position to somewhere outside the screen.
				this.targetPosition.set((prev) => {
					const offscreen = Vector.create(prev.x, prev.y).normalize().mult(2);
					return { ...prev, x: offscreen.x, y: offscreen.y };
				});

				return;
			}

			// Update the target position from the network.
			const location = effect.get(this.source.location.current);
			if (!location) return;

			this.targetPosition.set((prev) => {
				return {
					...prev,
					x: location.x ?? prev.x,
					y: location.y ?? prev.y,
					z: location.z ?? prev.z,
					scale: location.scale ?? prev.scale,
				};
			});
		});

		// Set a random default avatar while the user details are loading.
		// TODO Only start a broadcast after receiving the catalog to avoid this.
		this.avatar.src = Api.randomAvatar();

		// This doesn't use a memo because we intentionally prevent going back to the default avatar.
		this.signals.effect((effect) => {
			const user = effect.get(this.source.user);
			if (!user?.avatar) return; // don't unset

			// TODO only set the avatar if it successfully loads
			const newAvatar = new Image();
			newAvatar.src = user.avatar;

			const load = () => {
				this.avatar = newAvatar;
			};
			newAvatar.addEventListener("load", load);
			effect.cleanup(() => newAvatar.removeEventListener("load", load));
		});


		this.signals.effect(this.#runChat.bind(this));

		// If this is a remote broadcast, we need to reflect position updates via local broadcasts.
		if (props?.camera && this.source instanceof Watch.Broadcast) {
			this.#initRemote(this.source, props.camera, props.screen);
		}
	}

	// Special logic for only remote broadcasts.
	#initRemote(remote: Watch.Broadcast, camera: Publish.Broadcast, screen?: Publish.Broadcast) {
		const cameraUpdates = remote.location.peer();
		this.signals.cleanup(() => cameraUpdates.close());

		const screenUpdates = remote.location.peer();
		this.signals.cleanup(() => screenUpdates.close());

		// Update the handle when our path changes.
		this.signals.subscribe(camera.name, (name) => cameraUpdates.handle.set(name));

		// Request the position we should use from this remote broadcast.
		this.signals.effect((effect) => {
			// Only update the camera position if the local broadcast allows it.
			if (!effect.get(camera.location.handle)) return;

			const position = effect.get(cameraUpdates.location);
			if (!position) return;

			// Merge in the new position, keeping existing values when undefined.
			camera.location.current.set((prev) => ({ ...prev, ...position }));
		});

		if (screen) {
			// Update the handle when our name changes.
			this.signals.subscribe(screen.name, (name) => screenUpdates.handle.set(name));

			this.signals.effect((effect) => {
				// Only update the screen position if the local broadcast allows it.
				if (!effect.get(screen.location.handle)) return;

				const position = effect.get(screenUpdates.location);
				if (!position) return;

				// Merge in the new position, keeping existing values when undefined.
				screen.location.current.set((prev) => ({ ...prev, ...position }));
			});
		}

		// Create a new peer handle so we can publish updates if allowed.
		const peer = camera.location.peer();
		this.signals.cleanup(() => peer.close());

		this.signals.effect((effect) => {
			// Make sure we're actually publishing.
			if (!effect.get(camera.published)) return;

			// Only set the handle if the broadcast allows peering.
			const handle = effect.get(this.source.location.handle);
			if (!handle) return;

			effect.set(peer.handle, handle);
		});

		this.#locationPeer = peer;
	}

	async #runChat(effect: Effect) {
		if (!effect.get(this.source.chat.enabled)) return;

		const msg = effect.get(this.source.chat.message);
		if (!msg) return;

		// First, try to match the message to a known video/sound file.
		if (msg.startsWith("/")) {
			const meme = loadMeme(msg.slice(1));
			if (meme) {
				this.meme.set((prev) => {
					prev?.pause();
					return meme;
				});

				return;
			}
		}

		// Convert markdown to HTML.
		// TODO: Run in a web worker to prevent DoS attacks, apparently?
		const markdown = marked.parse(msg, { async: false });

		// Sanitize the resulting HTML.
		// ChatGPT says that allowing target is ONLY safe with noopener noreferrer,
		const sanitized = DOMPurify.sanitize(markdown, {
			ADD_ATTR: ["target", "rel"],
			RETURN_DOM_FRAGMENT: true,
		});

		this.audio.notifications?.play("chat");

		effect.set(this.message, sanitized);
	}

	// TODO Also make scale a signal
	tick(now: DOMHighResTimeStamp, scale: number) {
		this.video.tick(now);

		const bounds = this.bounds.peek().clone(); //  clone is needed so SolidJS can track changes
		const viewport = this.canvas.viewport.peek();

		const targetPosition = this.targetPosition.peek();

		// Guide the body towards the target position with a bit of force.
		const target = Vector.create((targetPosition.x + 0.5) * viewport.x, (targetPosition.y + 0.5) * viewport.y);

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
		this.scale += (targetPosition.scale - this.scale) * 0.1;

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
			return !this.source.location.handle.peek();
		}

		return false;
	}

	// Publish our current position to the network.
	publishPosition() {
		const position = this.targetPosition.peek();

		if (this.source instanceof Publish.Broadcast) {
			this.source.location.current.set((old) => ({ ...old, ...position }));
		} else if (this.#locationPeer) {
			this.#locationPeer.producer.peek()?.update(position);
		}
	}

	// Render a locator arrow for our local broadcasts on join
	renderLocator(now: DOMHighResTimeStamp, ctx: CanvasRenderingContext2D) {
		if (!this.source.enabled.peek()) return;

		if (!this.online.peek()) {
			this.#locatorStart = undefined;
			return;
		}

		if (!this.#locatorStart) {
			this.#locatorStart = now;
		}

		const elapsed = now - this.#locatorStart;
		const alpha = Math.min(Math.max((7000 - elapsed) / (10000 - 8000), 0), 1);
		if (alpha <= 0) {
			return;
		}

		const bounds = this.bounds.peek();
		const fontScale = Math.sqrt(this.scale); // NOTE: We don't use the room scale

		ctx.save();
		ctx.globalAlpha *= alpha;

		// Calculate arrow position and animation
		const arrowSize = 16 * fontScale;
		const pulseScale = 1 + Math.sin(now / 500) * 0.1; // Subtle pulsing effect
		const offset = 10 * fontScale;

		const gap = 2 * (arrowSize + offset);

		const x = Math.min(Math.max(bounds.position.x + bounds.size.x / 2, 0), ctx.canvas.width);
		const y = Math.min(Math.max(bounds.position.y, 2 * gap), ctx.canvas.height);

		ctx.translate(x, y - gap);
		ctx.scale(pulseScale, pulseScale);

		ctx.beginPath();
		ctx.moveTo(0, arrowSize);
		ctx.lineTo(-arrowSize / 2, 0);
		ctx.lineTo(arrowSize / 2, 0);
		ctx.closePath();

		// Style the arrow
		ctx.lineWidth = 2 * fontScale;
		ctx.strokeStyle = "#000"; // Gold color
		ctx.fillStyle = "#FFD700";
		ctx.stroke();
		ctx.fill();

		// Draw "YOU" text
		ctx.font = `bold ${14 + 12 * fontScale}px Arial`;
		ctx.textAlign = "center";
		ctx.textBaseline = "middle";
		ctx.fillStyle = "#FFD700";
		ctx.strokeText("YOU", 0, -arrowSize - offset);
		ctx.fillText("YOU", 0, -arrowSize - offset);

		/*
		// Add a subtle glow effect
		ctx.shadowColor = "#FFD700";
		ctx.shadowBlur = 10 * fontScale;
		ctx.stroke();
		*/

		ctx.restore();
	}

	close() {
		this.signals.close();
		this.source.close();
		this.audio.close();
	}
}
