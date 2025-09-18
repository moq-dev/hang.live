import { Publish, Watch } from "@kixelated/hang";
import * as Moq from "@kixelated/moq";
import { Effect } from "@kixelated/signals";
import Settings from "../settings";
import { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { Local } from "./local";
import { Space } from "./space";

export interface RoomProps {
	connection: Moq.Connection.Reload;
	canvas: Canvas;
	name: string;
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

	// The name of the room.
	name: string;

	#signals = new Effect();

	constructor(props: RoomProps) {
		this.connection = props.connection;
		this.local = props.local;
		this.name = props.name;
		this.space = new Space(props.canvas, props.local.sound);

		this.#signals.effect((effect) => {
			const connection = effect.get(this.connection.established);
			if (!connection) return;

			const announced = connection.announced(Moq.Path.from(this.name));
			effect.cleanup(() => announced.close());

			effect.spawn(this.#run.bind(this, announced));
			effect.cleanup(() => this.space.removeAll());
		});

		// After 1 second, start announcing new members.
		this.#signals.timer(() => {
			this.space.sound.tts.enabled.set(true);
		}, 1000);
	}

	async #run(announced: Moq.Announced) {
		for (;;) {
			const update = await announced.next();
			if (!update) break;

			let local: Publish.Broadcast | undefined;
			if (update.name === this.local.camera.name.peek()) {
				local = this.local.camera;
			} else if (update.name === this.local.share.name.peek()) {
				local = this.local.share;
			}

			if (local) {
				if (update.active) {
					const broadcast = new Broadcast(local, this.space.canvas, this.space.sound, {
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
				this.#addRemote(update.name);
			} else {
				this.space.remove(update.name);
			}
		}
	}

	#addRemote(name: Moq.Path.Valid) {
		const watch = new Watch.Broadcast({
			connection: this.connection.established,
			enabled: true,
			name: name,
			reload: false,
			// Download the location of the broadcaster.
			location: {
				window: { enabled: this.local.join },
				peers: { enabled: this.local.join },
			},
			chat: {
				// Download the chat of the broadcaster.
				message: { enabled: this.local.join },
				// And download the typing indicator.
				typing: { enabled: this.local.join },
			},
			// Download the preview track to receive high-level information about the broadcaster.
			preview: { enabled: true },
			audio: {
				// enabled: Toggled below.
				// Download the speaking indicator.
				speaking: { enabled: this.local.join },
				captions: { enabled: Settings.captions.render },
			},
			video: {
				// enabled: Toggled below.
			},
		});

		watch.signals.effect((effect) => {
			const join = effect.get(this.local.join);
			if (!join) return;

			const suspended = effect.get(this.space.sound.suspended);
			if (!suspended) return;

			effect.set(watch.audio.enabled, true, false);
		});

		watch.signals.effect((effect) => {
			const join = effect.get(this.local.join);
			if (!join) return;

			const visible = effect.get(this.space.canvas.visible);
			if (!visible) return;

			effect.set(watch.video.enabled, true, false);
		});

		const broadcast = new Broadcast(watch, this.space.canvas, this.space.sound, {
			audio: {
				sound: this.space.sound,
			},
			visible: true,
		});

		// Request the position we should use from this remote broadcast.
		broadcast.signals.effect((effect) => {
			const positions = effect.get(this.local.camera.location.peers.positions);
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

		this.space.add(name, broadcast);
	}

	close() {
		this.#signals.close();
		this.space.close();
	}
}
