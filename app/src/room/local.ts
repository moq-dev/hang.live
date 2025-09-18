import { Publish } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import * as Api from "../api";
import Settings from "../settings";
import * as Tauri from "../tauri";
import { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";
import { Sound } from "./sound";

/**
 * LocalBroadcasts manages the local camera and screen broadcasts.
 * It creates them early (before joining) and can optionally render a preview.
 */
export class Local {
	camera: Publish.Broadcast;
	microphone: Publish.Source.Microphone;
	webcam: Publish.Source.Camera;

	share: Publish.Broadcast;
	screen: Publish.Source.Screen;

	// For notifications, created here just because it's more convenient.
	sound: Sound;

	// The local user info.
	info = new Signal<Api.Account.Info | undefined>(undefined);

	// True when we're joining the room, not just previewing.
	// TODO Move this to the room.
	join = new Signal<boolean>(false);

	#signals = new Effect();

	// TODO Move the room stuff out of here.
	constructor() {
		this.sound = new Sound();

		if (Api.client.authenticated()) {
			this.#signals.spawn(async () => {
				const response = await Api.client.routes.account.info.$get();
				if (!response.ok) {
					throw new Error(`Failed to get info: ${response.statusText}`);
				}

				const info = await response.json();
				this.info.set(info);
			});
		}

		this.webcam = new Publish.Source.Camera({
			enabled: Settings.camera.enabled,
			device: { preferred: Settings.camera.device },
			constraints: {
				width: { ideal: 640 },
				height: { ideal: 640 },
				frameRate: { ideal: 60 },
				facingMode: { ideal: "user" },
				resizeMode: "none",
			},
		});
		this.#signals.cleanup(() => this.webcam.close());

		this.microphone = new Publish.Source.Microphone({
			enabled: Settings.microphone.enabled,
			device: { preferred: Settings.microphone.device },
			constraints: {
				channelCount: { ideal: 1, max: 2 },
				autoGainControl: { ideal: true },
				noiseSuppression: { ideal: true },
				echoCancellation: { ideal: true },
			},
		});
		this.#signals.cleanup(() => this.microphone.close());

		// Create the camera broadcast
		this.camera = new Publish.Broadcast({
			// NOTE: No connection, depends on the context.
			enabled: this.join,
			video: {
				enabled: Settings.camera.enabled,
				source: this.webcam.stream,
				flip: true, // TODO setting?
			},
			audio: {
				enabled: Settings.microphone.enabled,
				volume: Settings.microphone.gain,
				source: this.microphone.stream,
				speaking: {
					// TODO Figure out an efficient way to run models on mobile.
					enabled: !Tauri.MOBILE ? Settings.microphone.enabled : undefined,
				},
			},
			location: {
				window: {
					enabled: true,
					position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				},
				peers: {
					enabled: true,
				},
			},
			chat: {
				message: {
					enabled: true,
				},
				typing: {
					enabled: true,
				},
			},
			preview: {
				enabled: true,
			},
		});

		this.screen = new Publish.Source.Screen({
			video: {
				frameRate: { ideal: 60 },
				resizeMode: "none",
				width: { max: 1920 },
				height: { max: 1080 },
			},
			audio: {
				channelCount: { ideal: 2, max: 2 },
				autoGainControl: { ideal: false },
				echoCancellation: { ideal: false },
				noiseSuppression: { ideal: false },
			},
		});
		this.#signals.cleanup(() => this.screen.close());

		// Create the screen broadcast
		this.share = new Publish.Broadcast({
			audio: {
				enabled: this.screen.enabled,
			},
			video: {
				enabled: this.screen.enabled,
			},
			location: {
				window: {
					enabled: true,
					handle: Math.random().toString(36).substring(2, 15),
					position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
				},
				peers: {
					enabled: Settings.draggable,
				},
			},
			preview: {
				enabled: true,
			},
		});

		this.#signals.effect((effect) => {
			const stream = effect.get(this.screen.stream);
			if (!stream) return;

			effect.set(this.share.audio.source, stream.audio);
			effect.set(this.share.video.source, stream.video);
			effect.set(this.share.enabled, true, false); // only enable once there is a stream
		});

		// Enable transcription when the setting is enabled
		// TEMPORARILY DISABLED - Caption generation disabled
		/*
		this.camera.signals.effect((effect) => {
			// Only enable vad/transcription if audio is enabled
			const enabled = effect.get(this.camera.audio.enabled);
			if (!enabled) return;

			// Only enable transcription if the setting is enabled
			const captions = effect.get(Settings.captureCaptions);
			effect.set(this.camera.audio.captions.enabled, captions, false);
		});
		*/

		// Say hi when the user joins
		this.#signals.effect((effect) => {
			const name = effect.get(this.info)?.name;
			if (!name) return;

			// This is enabled on join.
			const enabled = effect.get(this.camera.enabled);
			if (!enabled) return;

			this.sound.tts.joined(name);
		});

		// Use the provided camera and screen broadcasts
		this.camera.signals.effect((effect) => {
			if (effect.get(this.camera.video.source) || effect.get(this.camera.audio.source)) {
				this.sound.play("select");
			}
		});

		this.share.signals.effect((effect) => {
			if (effect.get(this.share.video.source) || effect.get(this.share.audio.source)) {
				this.sound.play("select");
			}
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.message.latest);
			this.camera.preview.info.update((prev) => ({
				...prev,
				chat: !!message,
			}));
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.message.latest);
			if (!message) return;

			// Clear the message after 10 seconds.
			effect.timer(() => {
				this.camera.chat.message.latest.set("");
			}, 10000);
		});

		// Monitor VAD signal with some debouncing
		this.camera.signals.effect((effect) => {
			const speaking = effect.get(this.camera.audio.speaking.active);

			// Only update the preview if we've been speaking for at least 200ms, or not for 1s.
			// NOTE: The timer will get cleared when the effect is run again.
			effect.timer(
				() => {
					this.camera.preview.info.update((prev) => ({
						...prev,
						speaking,
					}));
				},
				speaking ? 1000 : 200,
			);
		});

		this.share.signals.effect((effect) => {
			const video = effect.get(this.camera.video.source);
			const audio = effect.get(this.camera.audio.source);

			this.camera.preview.info.update((prev) => ({
				...prev,
				video: !!video,
				audio: !!audio,
			}));
		});

		this.share.signals.effect((effect) => {
			const video = effect.get(this.share.video.source);
			const audio = effect.get(this.share.audio.source);

			this.share.preview.info.update((prev) => ({
				...prev,
				video: !!video,
				audio: !!audio,
			}));
		});

		// Initialize chat status as false
		this.camera.preview.info.update((prev) => ({
			...prev,
			chat: false,
			speaking: false,
			typing: false,
		}));
		this.share.preview.info.update((prev) => ({
			...prev,
			chat: false,
			speaking: false,
			typing: false,
		}));

		// Enable the screen when a media device is selected.
		this.share.signals.effect((effect) => {
			const join = effect.get(this.join);
			if (!join) return;

			const active = !!effect.get(this.share.video.source) || !!effect.get(this.share.audio.source);
			if (!active) return;

			effect.set(this.share.enabled, true, false);
			effect.cleanup(() => this.share.enabled.set(false));
		});

		this.#signals.effect((effect) => {
			const info = effect.get(this.info);
			if (!info) return;

			effect.set(this.camera.user, info);
			effect.set(this.share.user, { ...info, name: `${info.name} (Screen)` });
			effect.set(this.camera.preview.info, info);
			effect.set(this.share.preview.info, { ...info, name: `${info.name} (Screen)` });
		});

		// Save the guest account settings
		this.#signals.effect((effect) => {
			const info = effect.get(this.info);
			if (!info) return;

			Settings.account.id.set(info.id);
			Settings.account.name.set(info.name);
			Settings.account.avatar.set(info.avatar);
		});
	}

	close() {
		this.#signals.close();
		this.camera.close();
		this.share.close();
	}
}

/**
 * LocalPreview manages a small canvas preview of the local camera broadcast
 * before joining a room. It creates a minimal broadcast instance and renders
 * it continuously to a canvas element.
 */
export class LocalPreview {
	canvas: Canvas;
	broadcast: Broadcast<Publish.Broadcast>;
	sound: Sound;

	constructor(element: HTMLCanvasElement, camera: Publish.Broadcast) {
		// Create a minimal canvas without the background effects
		this.canvas = new Canvas(element, { demo: false });

		// Create a minimal sound context (muted for preview)
		this.sound = new Sound();
		this.sound.suspended.set(true); // Keep suspended for preview

		// Create a broadcast wrapper for rendering
		this.broadcast = new Broadcast(camera, this.canvas, this.sound, {
			visible: true,
		});

		this.canvas.onRender = this.#render.bind(this);
	}

	#render(ctx: CanvasRenderingContext2D, now: DOMHighResTimeStamp) {
		// HACK: We shouldn't do this every frame.
		this.broadcast.position.set({
			x: 0,
			y: 0,
			z: 0,
			s: 1,
		});

		const viewport = this.canvas.viewport.peek();
		const targetSize = this.broadcast.video.targetSize;

		const scale = Math.min(viewport.x / targetSize.x, viewport.y / targetSize.y) * 0.8;

		// Update broadcast physics (simplified for preview)
		this.broadcast.tick(scale);

		this.broadcast.audio.renderBackground(ctx);
		this.broadcast.audio.render(ctx);
		this.broadcast.video.render(now, ctx, { hovering: true });
	}

	close() {
		this.canvas.close();
		this.sound.close();
		this.broadcast.close(); // NOTE: Doesn't close the source broadcast.
	}
}
