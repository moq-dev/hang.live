import * as Api from "@hang/api/client";
import { Connection, type Moq, Publish, Watch } from "@kixelated/hang";
import { Path } from "@kixelated/moq";
import { Effect, Signal } from "@kixelated/signals";
import Settings from "../settings";
import { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { Notifications } from "./notifications";
import { Space } from "./space";

export type RoomProps = {
	name?: string;
	user?: string;
	avatar?: string;
	visible?: boolean;
};

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Connection;

	api: Api.Client;

	// The name of the room.
	name: Signal<string | undefined>;

	// The user ID of the local user.
	user: Signal<string | undefined>;

	// The avatar of the local user.
	avatar: Signal<string>;

	// When true, the AudioContext is suspended so we can't even visualize audio.
	// I really don't understand why browsers do this.
	suspended: Signal<boolean>;

	// The local broadcasts.
	// The camera/avatar is always published while the screen share is conditionally published.
	camera: Publish.Broadcast;
	screen: Publish.Broadcast;

	// Notifications use a shared AudioContext.
	notifications: Notifications;

	// The physics space for the room.
	space: Space;

	#signals = new Effect();

	constructor(canvas: Canvas, api: Api.Client, props?: RoomProps) {
		this.connection = new Connection();
		this.api = api;
		this.space = new Space(canvas);
		this.name = new Signal(props?.name);
		this.user = new Signal(props?.user);
		this.avatar = new Signal(props?.avatar ?? Api.randomAvatar());

		this.notifications = new Notifications();

		this.#signals.effect((effect) => {
			const name = effect.get(this.name);
			if (!name) return;

			// Given the room name, fetch a cooresponding token from the API server.
			effect.spawn(async () => {
				const response = await this.api.routes.room[":name"].join.$post({ param: { name } });
				if (!response.ok) {
					throw new Error(`Failed to join room: ${response.statusText}`);
				}
				const data = await response.json();

				// Set the name of the broadcasts to our account ID.
				// If anonymous, then this is randomly generated.
				this.camera.name.set(Path.from(data.account, "camera"));
				this.screen.name.set(Path.from(data.account, "screen"));

				this.connection.url.set(new URL(data.url));
				effect.cleanup(() => this.connection.url.set(undefined));
			});
		});

		this.camera = new Publish.Broadcast(this.connection, {
			device: "camera",
			video: {
				enabled: false, // TODO local storage?
				constraints: {
					// 480p but square, so the browser can choose the best aspect ratio.
					width: { ideal: 640 },
					height: { ideal: 640 },
					frameRate: { ideal: 60 },
					facingMode: { ideal: "user" },
					resizeMode: "none",
				},
			},
			audio: {
				enabled: false, // TODO automatically enable the microphone on join..?
				constraints: {
					// mono is fine? for microphone audio.
					channelCount: { ideal: 1, max: 2 },
					echoCancellation: Settings.headphones.peek() ? { exact: false } : { ideal: true },
					autoGainControl: { ideal: true },
					noiseSuppression: { ideal: true },
				},
				vad: true, // Always enable VAD because it's cheap.
			},
			// Publish our camera's location, starting at a random position.
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
			},
			user: {
				name: props?.user,
				avatar: props?.avatar,
			},
			chat: {
				enabled: true,
			},
			// A public preview for unauthenticated users.
			preview: {
				enabled: true,
			},
		});

		// Enable transcription when the setting is enabled.
		// The publisher is responsible for transcribing, regardless of if they want to display captions.
		this.#signals.subscribe(Settings.captureCaptions, (transcription) => {
			this.camera.audio.transcribe.set(transcription);
		});

		// Apply echo cancellation based on the headphones setting.
		this.#signals.effect((effect) => {
			const headphones = effect.get(Settings.headphones);
			this.camera.audio.constraints.set((prev) => ({
				...prev,
				echoCancellation: headphones ? { exact: false } : { ideal: true },
			}));
		});

		this.#signals.subscribe(Settings.draggable, (draggable) => {
			// Generate a random handle
			const handle = draggable ? Math.random().toString(36).substring(2, 15) : undefined;
			this.camera.location.handle.set(handle);
		});

		this.#signals.effect((effect) => {
			if (effect.get(this.camera.video.media) || effect.get(this.camera.audio.media)) {
				this.notifications.play("select");
			}
		});

		this.screen = new Publish.Broadcast(this.connection, {
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
				},
			},
			user: {
				name: props?.user ? `${props?.user} (Screen)` : undefined,
				avatar: props?.avatar,
			},
			// Publish our screen's location, starting at a random position.
			location: {
				enabled: true,
				current: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
			},
			// A public preview for unauthenticated users.
			preview: {
				enabled: true,
			},
		});

		this.#signals.subscribe(Settings.draggable, (draggable) => {
			// Generate a random handle
			const handle = draggable ? Math.random().toString(36).substring(2, 15) : undefined;
			this.screen.location.handle.set(handle);
		});

		this.#signals.effect((effect) => {
			if (effect.get(this.screen.video.media) || effect.get(this.screen.audio.media)) {
				this.notifications.play("select");
			}
		});

		// Update everything when a username is selected.
		this.camera.signals.effect((effect) => {
			const user = effect.get(this.user);
			if (!user) return;

			// Update the username
			this.camera.user.set((prev) => ({ ...prev, name: user }));
			this.screen.user.set((prev) => ({ ...prev, name: user ? `${user} (Screen)` : undefined }));
			this.camera.preview.info.set((prev) => ({ ...prev, name: user }));
			this.screen.preview.info.set((prev) => ({ ...prev, name: user ? `${user} (Screen)` : undefined }));

			this.camera.enabled.set(true);
			effect.cleanup(() => this.camera.enabled.set(false));
		});

		this.camera.signals.effect((effect) => {
			const avatar = effect.get(this.avatar);
			if (!avatar) return;

			this.camera.user.set((prev) => ({ ...prev, avatar }));
			this.screen.user.set((prev) => ({ ...prev, avatar }));
			this.camera.preview.info.set((prev) => ({ ...prev, avatar }));
			this.screen.preview.info.set((prev) => ({ ...prev, avatar }));
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.message);
			this.camera.preview.info.set((prev) => ({
				...prev,
				chat: !!message,
			}));
		});

		this.camera.signals.effect((effect) => {
			const message = effect.get(this.camera.chat.message);
			if (!message) return;

			// Clear the message after 5 seconds.
			effect.timer(() => {
				this.camera.chat.message.set(undefined);
			}, 5000);
		});

		// Monitor VAD signal with some debouncing
		this.camera.signals.effect((effect) => {
			const speaking = effect.get(this.camera.audio.speaking);

			// NOTE: The timer will get cleared when the effect is run again.
			// So it has to stay set for at least 100ms or unset for 1000ms.
			effect.timer(
				() => {
					this.camera.preview.info.set((prev) => ({
						...prev,
						speaking,
					}));
				},
				speaking ? 100 : 1000,
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
		}));
		this.screen.preview.info.set((prev) => ({
			...prev,
			chat: false,
			speaking: false,
		}));

		this.screen.signals.effect((effect) => {
			const user = effect.get(this.user);
			if (!user) return;

			const active = !!effect.get(this.screen.video.media) || !!effect.get(this.screen.audio.media);
			if (!active) return;

			this.screen.enabled.set(true);
			effect.cleanup(() => this.screen.enabled.set(false));
		});

		// Check if the user needs to click the page to unmute the audio.
		// TODO do this in a UI element.
		this.suspended = new Signal(this.notifications.suspended);

		// Determine when the user has interacted with the page so we can potentially unmute audio.
		const unsuspend = () => {
			this.suspended.set(false);
			this.notifications.resume();
		};

		window.addEventListener("click", unsuspend, { once: true });
		window.addEventListener("keydown", unsuspend, { once: true });

		// Don't download audio if the AudioContext is suspended.
		// TODO Move this to a separate class.
		this.#signals.subscribe(this.suspended, (suspended) => {
			for (const broadcast of this.space.ordered.peek()) {
				if (broadcast.source instanceof Watch.Broadcast) {
					broadcast.source.audio.enabled.set(!suspended);
				}
			}
		});

		this.#signals.effect((effect) => {
			const connection = effect.get(this.connection.established);
			if (!connection) return;

			const announced = connection.announced();
			effect.cleanup(() => announced.close());

			effect.spawn(this.#runRemotes.bind(this, announced));
		});
	}

	async #runRemotes(announced: Moq.AnnouncedConsumer, cancel: Promise<void>) {
		try {
			for (;;) {
				const update = await Promise.race([announced.next(), cancel]);

				// We're donezo.
				if (!update) break;

				let local: Publish.Broadcast | undefined;
				if (update.name === this.camera.name.peek()) {
					local = this.camera;
				} else if (update.name === this.screen.name.peek()) {
					local = this.screen;
				}

				if (local) {
					if (update.active) {
						const broadcast = new Broadcast(local, this.space.canvas, {
							audio: {
								notifications: this.notifications,
							},
							// Wait until we get an announcement before rendering ourselves as online.
							online: false,
						});

						this.space.add(update.name, broadcast);
					} else {
						this.space.remove(update.name);
					}
					continue;
				}

				if (update.active) {
					const watch = new Watch.Broadcast(this.connection, {
						enabled: true,
						name: update.name,
						reload: false,
						// Download the location of the broadcaster.
						location: { enabled: true },
						// Download the chat of the broadcaster.
						chat: { enabled: true },
					});

					// Download captions when the setting is enabled.
					watch.signals.subscribe(Settings.renderCaptions, (closedCaptions) => {
						watch.audio.transcribe.set(closedCaptions);
					});

					// Download video when the canvas is visible.
					watch.signals.subscribe(this.space.canvas.visible, (visible) => {
						watch.video.enabled.set(visible);
					});

					// Download audio when the AudioContext is not suspended.
					watch.signals.subscribe(this.suspended, (suspended) => {
						watch.audio.enabled.set(!suspended);
					});

					const broadcast = new Broadcast(watch, this.space.canvas, {
						camera: this.camera,
						screen: this.screen,
						audio: {
							notifications: this.notifications,
						},
						online: true,
					});

					this.notifications.play("sup");
					this.space.add(update.name, broadcast);
				} else {
					this.space.remove(update.name);
				}
			}
		} finally {
			this.space.removeAll();
		}
	}

	close() {
		this.#signals.close();

		this.space.close();
		this.camera.close();
		this.screen.close();
		this.notifications.close();
	}
}
