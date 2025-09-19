import { Publish } from "@kixelated/hang";
import type * as Moq from "@kixelated/moq";
import { Effect, Signal } from "@kixelated/signals";
import Settings from "../settings";
import * as Tauri from "../tauri";
import { Sound } from "./sound";

export interface LocalProps {
	connection?: Signal<Moq.Connection.Established | undefined> | Moq.Connection.Established;
	name?: Signal<string | undefined> | string;
	avatar?: Signal<string | undefined> | string;
}
/**
 * LocalBroadcasts manages the local camera and screen broadcasts.
 * It creates them early (before joining) and can optionally render a preview.
 */
export class Local {
	connection: Signal<Moq.Connection.Established | undefined>;

	camera: Publish.Broadcast;
	microphone: Publish.Source.Microphone;
	webcam: Publish.Source.Camera;

	share: Publish.Broadcast;
	screen: Publish.Source.Screen;

	// For notifications, created here just because it's more convenient.
	sound: Sound;

	// Name and avatar signals that can be overridden
	name: Signal<string | undefined>;
	avatar: Signal<string | undefined>;

	// Set to true to join the room immediately.
	// This is static because I'm lazy.
	static join = new Signal<boolean>(false);

	#signals = new Effect();

	constructor(props?: LocalProps) {
		this.connection = Signal.from(props?.connection);
		this.sound = new Sound();

		// Use provided name/avatar or fall back to Settings
		this.name = Signal.from(props?.name ?? Settings.account.name);
		this.avatar = Signal.from(props?.avatar ?? Settings.account.avatar);

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
			connection: this.connection,
			enabled: Local.join,
			user: {
				enabled: true,
				name: this.name,
				avatar: this.avatar,
			},
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
					handle: Math.random().toString(36).substring(2, 15),
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
				info: {
					chat: false,
					speaking: false,
					typing: false,
					screen: false,
				},
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
			connection: this.connection,
			audio: {
				enabled: this.screen.enabled,
			},
			video: {
				enabled: this.screen.enabled,
			},
			location: {
				window: {
					enabled: true,
					position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
					handle: Math.random().toString(36).substring(2, 15),
				},
				peers: {
					enabled: Settings.draggable,
				},
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
			const name = effect.get(Settings.account.name);
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

		this.camera.signals.effect((effect) => {
			const video = effect.get(this.camera.video.source);
			const audio = effect.get(this.camera.audio.source);

			this.camera.preview.info.update((prev) => ({
				...prev,
				video: !!video,
				audio: !!audio,
			}));
		});

		// Update the screen sharing status
		this.share.signals.effect((effect) => {
			const video = effect.get(this.share.video.source);
			const audio = effect.get(this.share.audio.source);

			this.camera.preview.info.update((prev) => ({
				...prev,
				screen: !!video || !!audio,
			}));
		});

		// Enable the screen when a media device is selected.
		this.share.signals.effect((effect) => {
			const join = effect.get(Local.join);
			if (!join) return;

			const active = !!effect.get(this.share.video.source) || !!effect.get(this.share.audio.source);
			if (!active) return;

			effect.set(this.share.enabled, true, false);
			effect.cleanup(() => this.share.enabled.set(false));
		});

		this.#signals.effect((effect) => {
			const name = effect.get(Settings.account.name);
			if (!name) return;

			if (name.endsWith("s")) {
				this.share.user.name.set(`${name}' Screen`);
			} else {
				this.share.user.name.set(`${name}'s Screen`);
			}
		});

		this.#signals.effect((effect) => {
			const name = effect.get(Settings.account.name);
			this.camera.preview.info.update((prev) => ({ ...prev, name }));
		});

		this.#signals.effect((effect) => {
			const avatar = effect.get(Settings.account.avatar);
			this.camera.preview.info.update((prev) => ({ ...prev, avatar }));
		});
	}

	close() {
		this.#signals.close();
		this.camera.close();
		this.share.close();
	}
}
