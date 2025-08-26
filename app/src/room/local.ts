import * as Api from "@hang/api/client";
import { Connection, Publish } from "@kixelated/hang";
import { Path } from "@kixelated/moq";
import { Effect, Signal } from "@kixelated/signals";
import Settings from "../settings";
import { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";
import { Sound } from "./sound";

/**
 * LocalBroadcasts manages the local camera and screen broadcasts.
 * It creates them early (before joining) and can optionally render a preview.
 */
export class Local {
	connection: Connection;
	api: Api.Client;
	room: string;

	camera: Publish.Broadcast;
	screen: Publish.Broadcast;

	// For notifications, created here just because it's more convenient.
	sound: Sound;

	// The local user info.
	info = new Signal<Api.Account.Info | undefined>(undefined);

	#signals = new Effect();

	constructor(connection: Connection, api: Api.Client, room: string) {
		this.connection = connection;
		this.api = api;
		this.room = room;

		this.sound = new Sound();

		this.#signals.spawn(async () => {
			const guest = Settings.guest.peek();

			const response = await api.routes.room[":room"].join.$post({ param: { room }, json: { guest } });
			if (!response.ok) {
				throw new Error(`Failed to join room: ${response.statusText}`);
			}

			const data = await response.json();
			connection.url.set(new URL(data.url));

			this.info.set(data.info);

			this.camera.name.set(Path.from(data.info.id, "camera"));
			this.screen.name.set(Path.from(data.info.id, "screen"));
		});

		// Create the camera broadcast
		this.camera = new Publish.Broadcast(connection, {
			enabled: false,
			device: "camera",
			video: {
				enabled: Settings.cameraEnabled.peek(),
				constraints: {
					width: { ideal: 640 },
					height: { ideal: 640 },
					frameRate: { ideal: 60 },
					facingMode: { ideal: "user" },
					resizeMode: "none",
				},
				flip: true, // TODO setting?
			},
			audio: {
				enabled: Settings.microphoneEnabled.peek(),
				constraints: {
					channelCount: { ideal: 1, max: 2 },
					autoGainControl: { ideal: true },
					noiseSuppression: { ideal: true },
				},
				speaking: {
					enabled: true,
				},
			},
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
			},
			chat: {
				markdown: {
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

		// Create the screen broadcast
		this.screen = new Publish.Broadcast(connection, {
			enabled: false,
			device: "screen",
			audio: {
				enabled: false,
				constraints: {
					channelCount: { ideal: 2, max: 2 },
					// Disable audio processing primarily for music playback.
					autoGainControl: { ideal: false },
					echoCancellation: { ideal: false },
					noiseSuppression: { ideal: false },
				},
			},
			video: {
				enabled: false,
				constraints: {
					frameRate: { ideal: 60 },
					resizeMode: "none",
					width: { max: 1920 },
					height: { max: 1080 },
				},
			},
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
			},
			preview: {
				enabled: true,
			},
		});

		// Update settings when media changes
		this.camera.signals.effect((effect) => {
			const audioMedia = effect.get(this.camera.audio.media);
			Settings.microphoneEnabled.set(!!audioMedia);
		});

		this.camera.signals.effect((effect) => {
			const videoMedia = effect.get(this.camera.video.media);
			Settings.cameraEnabled.set(!!videoMedia);
		});

		// Apply echo cancellation based on the headphones setting
		this.camera.signals.effect((effect) => {
			const headphones = effect.get(Settings.headphones);
			this.camera.audio.constraints.set((prev) => ({
				...prev,
				echoCancellation: headphones ? { exact: false } : { ideal: true },
			}));
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

		// Say hi when the camera is enabled
		this.camera.signals.effect((effect) => {
			const enabled = effect.get(this.camera.enabled);
			if (!enabled) return;

			const name = effect.get(this.info)?.name;
			if (!name) return;

			// Give the TTS worker a chance to start loading the model.
			effect.timer(() => {
				this.sound.joined(name);
			}, 100);
		});

		// Update draggable settings
		this.#signals.subscribe(Settings.draggable, (draggable) => {
			// Generate a random handle
			const handle = draggable ? Math.random().toString(36).substring(2, 15) : undefined;
			this.camera.location.handle.set(handle);
			this.screen.location.handle.set(handle);
		});

		// Use the provided camera and screen broadcasts
		this.camera.signals.effect((effect) => {
			if (effect.get(this.camera.video.media) || effect.get(this.camera.audio.media)) {
				this.sound.play("select");
			}
		});

		this.screen.signals.effect((effect) => {
			if (effect.get(this.screen.video.media) || effect.get(this.screen.audio.media)) {
				this.sound.play("select");
			}
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.markdown.message);
			this.camera.preview.info.set((prev) => ({
				...prev,
				chat: !!message,
			}));
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.markdown.message);
			if (!message) return;

			// Clear the message after 10 seconds.
			effect.timer(() => {
				this.camera.chat.markdown.message.set(undefined);
			}, 10000);
		});

		// Monitor VAD signal with some debouncing
		this.camera.signals.effect((effect) => {
			const speaking = effect.get(this.camera.audio.speaking.active);

			// Only update the preview if we've been speaking for at least 200ms, or not for 1s.
			// NOTE: The timer will get cleared when the effect is run again.
			effect.timer(
				() => {
					this.camera.preview.info.set((prev) => ({
						...prev,
						speaking,
					}));
				},
				speaking ? 1000 : 200,
			);
		});

		this.screen.signals.effect((effect) => {
			const video = effect.get(this.camera.video.media);
			const audio = effect.get(this.camera.audio.media);

			this.camera.preview.info.set((prev) => ({
				...prev,
				video: !!video,
				audio: !!audio,
			}));
		});

		this.screen.signals.effect((effect) => {
			const video = effect.get(this.screen.video.media);
			const audio = effect.get(this.screen.audio.media);

			this.screen.preview.info.set((prev) => ({
				...prev,
				video: !!video,
				audio: !!audio,
			}));
		});

		// Initialize chat status as false
		this.camera.preview.info.set((prev) => ({
			...prev,
			chat: false,
			speaking: false,
			typing: false,
		}));
		this.screen.preview.info.set((prev) => ({
			...prev,
			chat: false,
			speaking: false,
			typing: false,
		}));

		// Enable the screen when a media device is selected.
		this.screen.signals.effect((effect) => {
			const active = !!effect.get(this.screen.video.media) || !!effect.get(this.screen.audio.media);
			if (!active) return;

			this.screen.enabled.set(true);
			effect.cleanup(() => this.screen.enabled.set(false));
		});

		this.#signals.effect((effect) => {
			const info = effect.get(this.info);
			if (!info) return;

			effect.set(this.camera.user, info);
			effect.set(this.screen.user, { ...info, name: `${info.name} (Screen)` });
			effect.set(this.camera.preview.info, info);
			effect.set(this.screen.preview.info, { ...info, name: `${info.name} (Screen)` });
		});

		// Save the guest account settings
		this.#signals.effect((effect) => {
			const info = effect.get(this.info);
			if (!info) return;

			Settings.guest.set(info);
		});

		// Auto-join if our ID is already published.
		this.#signals.effect((effect) => {
			const enabled = effect.get(this.camera.enabled);
			if (enabled) return;

			const id = effect.get(this.camera.name);
			if (!id) return;

			const connection = effect.get(this.connection.established);
			if (!connection) return;

			const announced = connection.announced();
			effect.cleanup(() => announced.close());

			effect.spawn(async (cancel) => {
				for (;;) {
					const next = await Promise.race([announced.next(), cancel]);
					if (!next) break;

					// If our ID is announced and active, join the room immediately.
					// This makes refreshing much easier; you don't need to click rejoin.
					if (next.name === id && next.active) {
						this.camera.enabled.set(true);
						break;
					}
				}
			});
		});
	}

	close() {
		this.#signals.close();
		this.camera.close();
		this.screen.close();
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
		this.broadcast.targetPosition.set({
			x: 0,
			y: 0,
			z: 0,
			scale: 1,
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
