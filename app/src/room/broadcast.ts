import { type Catalog, Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import { Audio, type AudioProps } from "./audio";
import { Canvas } from "./canvas";
import { Captions } from "./captions";
import { Chat } from "./chat";
import { FakeBroadcast } from "./fake";
import { Bounds, Vector } from "./geometry";
import { Sound } from "./sound";
import { Video } from "./video";

export type BroadcastSource = Watch.Broadcast | Publish.Broadcast | FakeBroadcast;

export type ChatMessage = {
	audio?: HTMLAudioElement;
	video?: HTMLVideoElement;
	element: Node;
	received: DOMHighResTimeStamp;
	expires: DOMHighResTimeStamp;
};

export type BroadcastProps = {
	audio?: AudioProps;
	position?: Catalog.Position;
	visible?: boolean;
};

// Catalog.Position but all fields are required.
type Position = {
	x: number;
	y: number;
	z: number;
	s: number;
};

export class Broadcast<T extends BroadcastSource = BroadcastSource> {
	source: T;
	canvas: Canvas;

	audio: Audio;
	video: Video;
	chat: Chat;
	captions: Captions;

	// The current chat message, if any.
	message = new Signal<HTMLElement | undefined>(undefined);

	bounds: Signal<Bounds>; // 0 to canvas
	scale = 1.0; // 1 is 100%
	velocity = Vector.create(0, 0); // in pixels per ?

	// Replaced by position
	//targetPosition = Vector.create(0, 0); // -0.5 to 0.5, sent over the network
	//targetScale = 1.0; // 1 is 100%

	visible: Signal<boolean>;

	// The target position of the broadcast, while bounds contains the actual position.
	// This is separate from the source.location.current so we can temporarily use our own value.
	// After we learn the real position over the network, we'll replace it.
	position: Signal<Position>;

	// The meme video/audio we're rendering, if any.
	meme = new Signal<HTMLVideoElement | HTMLAudioElement | undefined>(undefined);
	memeName = new Signal<string | undefined>(undefined);

	// Show a locator arrow for 8 seconds to show our position on join.
	#locatorStart?: DOMHighResTimeStamp;

	signals = new Effect();

	constructor(source: T, canvas: Canvas, sound: Sound, props?: BroadcastProps) {
		this.source = source;
		this.canvas = canvas;
		this.visible = new Signal(props?.visible ?? true);

		// Unless provided, start them at the center of the screen with a tiiiiny bit of variance to break ties.
		const start = () => (Math.random() - 0.5) / 100;
		const position = {
			x: props?.position?.x ?? start(),
			y: props?.position?.y ?? start(),
			z: props?.position?.z ?? 0,
			s: props?.position?.s ?? 1,
		};

		this.position = new Signal(position);

		this.video = new Video(this);
		this.audio = new Audio(this, sound, props?.audio);
		this.chat = new Chat(this, canvas);
		this.captions = new Captions(this, canvas);

		// Actually start the
		// TODO This seems kinda buggy?
		const viewport = this.canvas.viewport.peek();

		let startPosition = Vector.create(position.x, position.y);
		if (position.x === 0 && position.y === 0) {
			// If we're in the center, avoid dividing by zero.
			startPosition = Vector.create(Math.random() - 0.5, Math.random() - 0.5);
		}

		// Normalize to find the closest edge of the screen.
		startPosition = startPosition.normalize().mult(viewport.length()).add(viewport.div(2));

		this.bounds = new Signal(new Bounds(startPosition, this.video.targetSize));

		// Load the broadcaster's position from the network.
		this.signals.effect((effect) => {
			if (!effect.get(this.visible)) {
				// Change the target position to somewhere outside the screen.
				this.position.update((prev) => {
					const offscreen = Vector.create(prev.x, prev.y).normalize().mult(2);
					return { ...prev, x: offscreen.x, y: offscreen.y };
				});

				return;
			}

			// Update the target position from the network.
			const location = effect.get(this.source.location.window.position);
			if (!location) return;

			this.position.update((prev) => {
				return {
					...prev,
					x: location.x ?? prev.x,
					y: location.y ?? prev.y,
					z: location.z ?? prev.z,
					s: location.s ?? prev.s,
				};
			});
		});

		this.signals.effect(this.#runChat.bind(this));
	}

	#runChat(effect: Effect) {
		const enabled = effect.get(this.source.chat.message.enabled);
		if (!enabled) return;

		const msg = effect.get(this.source.chat.message.latest);
		if (!msg) return;

		// First, try to match the message to a known video/sound file.
		if (msg.startsWith("/")) {
			const memeName = msg.slice(1);
			const meme = this.audio.sound.meme(memeName);
			if (meme) {
				this.meme.update((prev) => {
					prev?.pause();
					return meme;
				});
				this.memeName.set(memeName);

				return;
			}
		}

		effect.spawn(async () => {
			// Parse the markdown into sanitized HTML using a background WebWorker.
			const parsed = await this.chat.parse(msg);
			if (!parsed) return;

			effect.set(this.message, parsed);
			this.audio.sound.notification("chat");
		});
	}

	// TODO Also make scale a signal
	tick(scale: number) {
		this.video.tick();

		const bounds = this.bounds.peek().clone(); //  clone is needed so SolidJS can track changes
		const viewport = this.canvas.viewport.peek();

		const targetPosition = this.position.peek();

		// Guide the body towards the target position with a bit of force.
		const target = Vector.create((targetPosition.x + 0.5) * viewport.x, (targetPosition.y + 0.5) * viewport.y);

		// Make sure the target position is within the viewport.
		target.x = Math.max(0, Math.min(target.x, viewport.x));
		target.y = Math.max(0, Math.min(target.y, viewport.y));

		const middle = this.bounds.peek().middle();
		const force = target.sub(middle);
		this.velocity = this.velocity.add(force);

		const PADDING = 32;

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
		this.scale += (targetPosition.s - this.scale) * 0.1;

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
			return !this.source.location.window.handle.peek();
		}

		return false;
	}

	// Render a locator arrow for our local broadcasts on join
	renderLocator(now: DOMHighResTimeStamp, ctx: CanvasRenderingContext2D) {
		if (!this.source.enabled.peek()) return;

		if (!this.visible.peek()) {
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

		ctx.save();
		ctx.globalAlpha *= alpha;

		// Calculate arrow position and animation
		const arrowSize = 12 * this.scale;
		const pulseScale = 1 + Math.sin(now / 500) * 0.1; // Subtle pulsing effect
		const offset = 10 * this.scale;

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
		ctx.lineWidth = 4 * this.scale;
		ctx.strokeStyle = "#000"; // Gold color
		ctx.fillStyle = "#FFD700";
		ctx.stroke();
		ctx.fill();

		// Draw "YOU" text
		const fontSize = Math.round(32 * this.scale); // round to avoid busting font caches
		ctx.font = `bold ${fontSize}px Arial`;
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
		this.audio.close();
		this.chat.close();
		this.captions.close();

		// NOTE: Don't close the source broadcast; we need it for the local preview.
		// this.source.close();
	}
}
