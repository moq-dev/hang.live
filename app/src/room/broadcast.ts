import * as Api from "@hang/api/client";
import { type Catalog, Publish, Watch } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import DOMPurify from "dompurify";
import { marked } from "marked";
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

// Create a markdown renderer that opens links in a new tab.
const renderer = new marked.Renderer();

renderer.link = ({ href, title, text }) => {
	const t = title ? ` title="${title}"` : "";
	const safeHref = href ?? "#";
	// Important: target="_blank" rel="noopener noreferrer"
	return `<a href="${safeHref}" target="_blank" rel="noopener noreferrer"${t}>${text}</a>`;
};

marked.use({ renderer });

// Weighted join announcements with varying rarity
const JOIN_ANNOUNCEMENTS = [
	// Common (70% chance total)
	{ text: "{name} joined.", weight: 20 },
	{ text: "Sup {name}.", weight: 15 },
	{ text: "{name} is here.", weight: 10 },
	{ text: "What's up {name}?", weight: 10 },
	{ text: "Yo {name}.", weight: 10 },
	{ text: "{name} has entered.", weight: 8 },
	{ text: "Welcome {name}.", weight: 7 },

	// Uncommon (20% chance total)
	{ text: "{name} has arrived.", weight: 4 },
	{ text: "{name} rolled up.", weight: 3 },
	{ text: "{name} showed up.", weight: 3 },
	{ text: "{name} slid in.", weight: 2.5 },
	{ text: "{name} just dropped.", weight: 2.5 },
	{ text: "Look who it is, {name}.", weight: 2 },
	{ text: "{name} in the building.", weight: 2 },
	{ text: "{name} has graced us.", weight: 1 },

	// Rare (8% chance total)
	{ text: "Behold, {name} approaches.", weight: 1.5 },
	{ text: "{name} has manifested.", weight: 1.5 },
	{ text: "Alert: {name} detected.", weight: 1 },
	{ text: "{name} teleported in.", weight: 1 },
	{ text: "A wild {name} appeared.", weight: 1 },
	{ text: "{name} spawned", weight: 1 },
	{ text: "{name} has entered the chat.", weight: 0.5 },
	{ text: "Everybody act normal, {name} is here.", weight: 0.5 },

	// Ultra-rare (2% chance total)
	{ text: "Praise be, the lord and savior {name} has graced us with their presence.", weight: 0.3 },
	{ text: "Ladies and gentlemen, we got {name} here.", weight: 0.3 },
	{ text: "Stop everything, {name} has blessed us with their divine presence.", weight: 0.2 },
	{ text: "Breaking news: {name} has been spotted in the vicinity.", weight: 0.2 },
	{ text: "The prophecy foretold of {name}'s arrival.", weight: 0.2 },
	{ text: "Historians will mark this moment: {name} has joined.", weight: 0.2 },
	{ text: "The legends spoke of this day when {name} would join us.", weight: 0.15 },
	{ text: "Sound the horns, {name} has arrived at the gates.", weight: 0.15 },
	{ text: "By the ancient laws, we welcome {name} to our realm.", weight: 0.1 },
	{ text: "The stars have aligned to bring us {name}.", weight: 0.1 },
	{
		text: "From the Ghastly Eyrie I can see to the ends of the world, and from this vantage point I declare with utter certainty that {name} has joined the hang!",
		weight: 0.01,
	},
] as const;

const JOIN_ANNOUNCEMENTS_WEIGHT = JOIN_ANNOUNCEMENTS.reduce((sum, item) => sum + item.weight, 0);

// Weighted leave announcements with varying rarity
const LEAVE_ANNOUNCEMENTS = [
	// Common (70% chance total)
	{ text: "{name} has left.", weight: 20 },
	{ text: "{name} left.", weight: 15 },
	{ text: "Bye {name}.", weight: 10 },
	{ text: "{name} is gone.", weight: 8 },
	{ text: "{name} disconnected.", weight: 7 },
	{ text: "See ya {name}.", weight: 5 },
	{ text: "{name} dipped.", weight: 5 },

	// Uncommon (20% chance total)
	{ text: "{name} peaced out.", weight: 3 },
	{ text: "{name} bounced.", weight: 3 },
	{ text: "{name} vanished.", weight: 2.5 },
	{ text: "{name} has departed.", weight: 2 },
	{ text: "{name} ghosted.", weight: 2 },
	{ text: "{name} rage quit.", weight: 2 },
	{ text: "{name} went to get milk.", weight: 1.5 },
	{ text: "{name} has abandoned us.", weight: 1.5 },
	{ text: "{name} evaporated.", weight: 1.5 },

	// Rare (8% chance total)
	{ text: "{name} died.", weight: 1.5 },
	{ text: "{name} got thanos snapped.", weight: 1 },
	{ text: "{name} returned to the void.", weight: 1 },
	{ text: "{name} has been yeeted from existence.", weight: 1 },
	{ text: "{name} faded away.", weight: 0.8 },
	{ text: "Press F to pay respects, {name} is gone.", weight: 0.8 },
	{ text: "{name} has left the chat.", weight: 0.5 },
	{ text: "{name} went poof.", weight: 0.5 },
	{ text: "{name} disconnected from the matrix.", weight: 0.5 },
	{ text: "{name} was recalled to headquarters.", weight: 0.4 },

	// Ultra-rare (2% chance total)
	{ text: "The universe is a sadder place now that {name} has left.", weight: 0.3 },
	{ text: "And thus {name} departed, never to be seen again... probably.", weight: 0.25 },
	{ text: "{name} has ascended to a higher plane of existence.", weight: 0.2 },
	{ text: "Historians will note the tragic departure of {name}.", weight: 0.2 },
	{ text: "With a heavy heart, we bid farewell to {name}.", weight: 0.2 },
	{ text: "The prophecy has been fulfilled, {name} has left us.", weight: 0.15 },
	{ text: "{name} has been banished to the shadow realm.", weight: 0.15 },
	{ text: "Legends say {name} will return... but not today.", weight: 0.15 },
	{ text: "As foretold by the ancients, {name} has departed.", weight: 0.1 },
	{ text: "The void calls, and {name} must answer.", weight: 0.1 },
	{ text: "{name} has gone where no one can follow.", weight: 0.1 },
	{ text: "{name} has been sent to the void.", weight: 0.1 },
	{
		text: "From the Ghastly Eyrie I can see to the ends of the world, and from this vantage point I declare with utter certainty that {name} has left the hang!",
		weight: 0.01,
	},
];

const LEAVE_ANNOUNCEMENTS_WEIGHT = LEAVE_ANNOUNCEMENTS.reduce((sum, item) => sum + item.weight, 0);

export type BroadcastProps = {
	audio?: AudioProps;

	position?: Catalog.Position;
	camera?: Publish.Broadcast;
	screen?: Publish.Broadcast;

	visible?: boolean;
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
	sound: Sound;

	audio: Audio;
	video: Video;
	chat: Chat;
	captions: Captions;

	// The current chat message, if any.
	message = new Signal<DocumentFragment | undefined>(undefined);

	bounds: Signal<Bounds>; // 0 to canvas
	scale = 1.0; // 1 is 100%
	velocity = Vector.create(0, 0); // in pixels per ?

	// Replaced by position
	//targetPosition = Vector.create(0, 0); // -0.5 to 0.5, sent over the network
	//targetScale = 1.0; // 1 is 100%

	visible: Signal<boolean>;

	// 1 when a video frame is fully rendered, 0 when their avatar is fully rendered.
	transition = 0;

	avatar = new Image();
	name = new Signal<string | undefined>(undefined);

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

	constructor(source: T, canvas: Canvas, sound: Sound, props?: BroadcastProps) {
		this.source = source;
		this.canvas = canvas;
		this.sound = sound;
		this.visible = new Signal(props?.visible ?? true);

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
		this.audio = new Audio(this, sound, props?.audio);
		this.chat = new Chat(this, canvas);
		this.captions = new Captions(this, canvas);

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
			if (!effect.get(this.visible)) {
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

		// A separate signal to deduplicate name updates.
		this.signals.effect((effect) => {
			const user = effect.get(this.source.user);
			this.name.set(user?.name);
		});

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

			effect.eventListener(newAvatar, "load", load);
		});

		this.signals.effect((effect) => {
			if (!effect.get(this.visible)) return;

			const name = effect.get(this.name);
			if (!name) return;
			this.sound.say(this.#getJoinAnnouncement(name));
		});

		this.signals.effect((effect) => {
			if (effect.get(this.visible)) return;

			const name = effect.get(this.name);
			if (!name) return;
			this.sound.say(this.getLeaveAnnouncement(name));
		});

		this.signals.effect(this.#runChat.bind(this));

		// If this is a remote broadcast, we need to reflect position updates via local broadcasts.
		if (props?.camera && this.source instanceof Watch.Broadcast) {
			this.#initRemote(this.source, props.camera, props.screen);
		}
	}

	// Get a weighted random join announcement
	#getJoinAnnouncement(name: string): string {
		const random = Math.random() * JOIN_ANNOUNCEMENTS_WEIGHT;
		let accumulated = 0;

		for (const announcement of JOIN_ANNOUNCEMENTS) {
			accumulated += announcement.weight;
			if (random <= accumulated) {
				return announcement.text.replace("{name}", name);
			}
		}

		// Fallback (should never reach here)
		return `${name} joined`;
	}

	// Get a weighted random leave announcement
	getLeaveAnnouncement(name: string): string {
		const random = Math.random() * LEAVE_ANNOUNCEMENTS_WEIGHT;
		let accumulated = 0;

		for (const announcement of LEAVE_ANNOUNCEMENTS) {
			accumulated += announcement.weight;
			if (random <= accumulated) {
				return announcement.text.replace("{name}", name);
			}
		}

		// Fallback (should never reach here)
		return `${name} has left`;
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
			const meme = this.audio.sound.meme(msg.slice(1));
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

		this.audio.sound.notification("chat");

		effect.set(this.message, sanitized);
	}

	// TODO Also make scale a signal
	tick(scale: number) {
		this.video.tick();

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

		const PADDING = 32 * devicePixelRatio;

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
		const arrowSize = 12 * this.scale * devicePixelRatio;
		const pulseScale = 1 + Math.sin(now / 500) * 0.1; // Subtle pulsing effect
		const offset = 10 * this.scale * devicePixelRatio;

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
		ctx.font = `bold ${32 * this.scale}px Arial`;
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
