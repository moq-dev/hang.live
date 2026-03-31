import * as Moq from "@moq/lite";
import * as Publish from "@moq/publish";
import { Effect, Signal } from "@moq/signals";
import { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { Local } from "./local";
import { Locator } from "./locator";
import { Sound } from "./sound";
import { Space } from "./space";
import { WatchBroadcast } from "./watch";

export interface RoomProps {
	connection: Moq.Connection.Reload;
	canvas: Canvas;
	sound: Sound;
	local: Local;
}

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Moq.Connection.Reload;

	// The local broadcasts.
	// The camera/avatar is always published while the screen share is conditionally published.
	local: Local;

	// The physics space for the room.
	space: Space;

	#cameraBroadcast = new Signal<Broadcast<Publish.Broadcast> | undefined>(undefined);
	#shareBroadcast = new Signal<Broadcast<Publish.Broadcast> | undefined>(undefined);

	#signals = new Effect();

	constructor(props: RoomProps) {
		this.connection = props.connection;
		this.local = props.local;
		this.space = new Space(props.canvas, props.sound);

		this.#signals.effect((effect) => {
			const connection = effect.get(this.connection.established);
			if (!connection) return;

			const announced = connection.announced();
			effect.cleanup(() => announced.close());

			effect.spawn(this.#run.bind(this, announced));
			effect.cleanup(() => {
				const all = this.space.clear();
				for (const broadcast of all) {
					broadcast.close();
					if (!(broadcast.source instanceof Publish.Broadcast)) {
						broadcast.source.close();
					}
				}
			});
		});

		// After 1 second, start announcing new members.
		this.#signals.timer(() => {
			this.space.sound.tts.enabled.set(true);
		}, 1000);

		// Manage the locator for the camera broadcast
		this.#signals.effect((effect) => {
			const cameraBroadcast = effect.get(this.#cameraBroadcast);
			if (!cameraBroadcast) return;

			const locator = new Locator(cameraBroadcast);
			effect.cleanup(() => locator.close());

			// Auto-close after 8 seconds (7s visible + 1s fade transition)
			effect.timer(() => locator.close(), 8000);
		});

		// Manage the locator for the share broadcast
		this.#signals.effect((effect) => {
			const shareBroadcast = effect.get(this.#shareBroadcast);
			if (!shareBroadcast) return;

			const locator = new Locator(shareBroadcast);
			effect.cleanup(() => locator.close());

			// Auto-close after 8 seconds (7s visible + 1s fade transition)
			effect.timer(() => locator.close(), 8000);
		});

		// Play a sound when the camera or screen is selected
		this.local.camera.signals.effect((effect) => {
			if (effect.get(this.local.camera.video.source) || effect.get(this.local.camera.audio.source)) {
				this.space.sound.notification("select");
			}
		});

		this.local.share.signals.effect((effect) => {
			if (effect.get(this.local.share.video.source) || effect.get(this.local.share.audio.source)) {
				this.space.sound.notification("select");
			}
		});
	}

	async #run(announced: Moq.Announced) {
		for (;;) {
			const update = await announced.next();
			if (!update) break;

			if (update.path === this.local.camera.name.peek()) {
				if (update.active) {
					const broadcast = this.space.add(update.path, this.local.camera);
					this.#cameraBroadcast.set(broadcast as Broadcast<Publish.Broadcast>);
				} else {
					this.space.remove(update.path);
					this.#cameraBroadcast.set(undefined);
				}

				continue;
			}

			if (update.path === this.local.share.name.peek()) {
				if (update.active) {
					const broadcast = this.space.add(update.path, this.local.share);
					this.#shareBroadcast.set(broadcast as Broadcast<Publish.Broadcast>);
				} else {
					this.space.remove(update.path);
					this.#shareBroadcast.set(undefined);
				}

				continue;
			}

			if (update.active) {
				this.#addRemote(update.path);
			} else {
				this.space.remove(update.path).then((broadcast) => broadcast.close());
			}
		}
	}

	#addRemote(path: Moq.Path.Valid) {
		const watch = new WatchBroadcast({
			connection: this.connection.established,
			enabled: true,
			name: path,
			reload: false,
			location: {
				window: { enabled: true },
				peers: { enabled: true },
			},
			chat: {
				message: { enabled: true },
				typing: { enabled: true },
			},
			preview: { enabled: true },
			audio: {
				enabled: this.space.sound.enabled,
			},
			video: {
				enabled: this.space.canvas.visible,
			},
		});

		// Request the position we should use from this remote broadcast.
		watch.signals.effect((effect) => {
			const positions = effect.get(watch.location.peers.positions);
			if (!positions) return;

			// Check if our local handles are in the positions.
			const camera = effect.get(this.local.camera.location.window.handle);
			const screen = effect.get(this.local.share.location.window.handle);

			// TODO Only update if it's not the same as the previous position.

			if (camera && camera in positions) {
				const position = positions[camera];
				this.local.camera.location.window.position.update((prev) => ({ ...prev, ...position }));
			}

			if (screen && screen in positions) {
				const position = positions[screen];
				this.local.share.location.window.position.update((prev) => ({ ...prev, ...position }));
			}
		});

		this.space.add(path, watch);
	}

	close() {
		this.#signals.close();
		this.space.close();
	}
}
