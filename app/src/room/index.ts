import { Connection, type Moq, Publish, Watch } from "@kixelated/hang";
import { Effect } from "@kixelated/signals";
import Settings from "../settings";
import { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { Local } from "./local";
import { Sound } from "./sound";
import { Space } from "./space";

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Connection;

	// The local broadcasts.
	// The camera/avatar is always published while the screen share is conditionally published.
	local: Local;

	// Notifications use a shared AudioContext.
	sound: Sound;

	// The physics space for the room.
	space: Space;

	// For the first second after joining, don't announce new members.
	#tts = false;

	#signals = new Effect();

	constructor(connection: Connection, canvas: Canvas, local: Local) {
		this.connection = connection;
		this.local = local;
		this.space = new Space(canvas);
		this.sound = local.sound;

		this.#signals.effect((effect) => {
			const connection = effect.get(this.connection.established);
			if (!connection) return;

			const announced = connection.announced();
			effect.cleanup(() => announced.close());

			effect.spawn(this.#runRemotes.bind(this, announced));
		});

		// After 1 second, start announcing new members.
		this.#signals.timer(() => {
			this.#tts = true;
		}, 1000);
	}

	async #runRemotes(announced: Moq.AnnouncedConsumer, cancel: Promise<void>) {
		try {
			for (;;) {
				const update = await Promise.race([announced.next(), cancel]);

				// We're donezo.
				if (!update) break;

				let local: Publish.Broadcast | undefined;
				if (update.name === this.local.camera.name.peek()) {
					local = this.local.camera;
				} else if (update.name === this.local.share.name.peek()) {
					local = this.local.share;
				}

				if (local) {
					if (update.active) {
						const broadcast = new Broadcast(local, this.space.canvas, this.sound, {
							// Wait until we get an announcement before rendering ourselves as online.
							visible: false,
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
						chat: {
							// Download the chat of the broadcaster.
							message: { enabled: true },
							// And download the typing indicator.
							typing: { enabled: true },
						},
						// Download the preview track for typing indicators.
						preview: { enabled: true },
						audio: {
							// Download the speaking indicator.
							speaking: { enabled: true },
							captions: { enabled: Settings.captions.render },
						},
					});

					// Download captions when the setting is enabled.
					// TEMPORARILY DISABLED - Caption generation disabled
					/*
					watch.signals.subscribe(Settings.renderCaptions, (closedCaptions) => {
						watch.audio.captions.enabled.set(closedCaptions);
					});
					*/

					// Download video when the canvas is visible.
					watch.signals.subscribe(this.space.canvas.visible, (visible) => {
						watch.video.enabled.set(visible);
						//watch.video.detection.enabled.set(visible);
					});

					// Download audio when the AudioContext is not suspended.
					watch.signals.subscribe(this.sound.suspended, (suspended) => {
						watch.audio.enabled.set(!suspended);
					});

					const broadcast = new Broadcast(watch, this.space.canvas, this.sound, {
						camera: this.local.camera,
						audio: {
							sound: this.sound,
						},
						visible: true,
					});

					this.space.add(update.name, broadcast);

					broadcast.signals.effect((effect) => {
						if (!effect.get(broadcast.visible)) return;

						const name = effect.get(broadcast.name);
						if (!name) return;

						if (this.#tts) {
							this.sound.joined(name);
						}
					});

					broadcast.signals.effect((effect) => {
						if (effect.get(broadcast.visible)) return;

						const name = effect.get(broadcast.name);
						if (!name) return;

						if (this.#tts) {
							this.sound.left(name);
						}
					});
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
	}
}
