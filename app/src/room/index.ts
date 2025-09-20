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

	#signals = new Effect();

	constructor(props: RoomProps) {
		this.connection = props.connection;
		this.local = props.local;
		this.space = new Space(props.canvas, props.local.sound);

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
			this.space.sound?.tts.enabled.set(true);
		}, 1000);
	}

	async #run(announced: Moq.Announced) {
		for (;;) {
			const update = await announced.next();
			if (!update) break;

			let local: Publish.Broadcast | undefined;
			if (update.path === this.local.camera.path.peek()) {
				local = this.local.camera;
			} else if (update.path === this.local.share.path.peek()) {
				local = this.local.share;
			}

			if (local) {
				if (update.active) {
					const broadcast = new Broadcast(local, this.space.canvas, this.space.sound, {
						// Wait until we get an announcement before rendering ourselves as online.
						visible: false,
					});

					this.space.add(update.path, broadcast);
				} else {
					this.space.remove(update.path).then((broadcast) => {
						broadcast.close();
						// We don't close local sources so we can toggle them.
					});
				}
				continue;
			}

			if (update.active) {
				this.#addRemote(update.path);
			} else {
				this.space.remove(update.path).then((broadcast) => {
					broadcast.close();
					broadcast.source.close();
				});
			}
		}
	}

	#addRemote(path: Moq.Path.Valid) {
		const watch = new Watch.Broadcast({
			connection: this.connection.established,
			enabled: true,
			path,
			reload: false,
			// Download the location of the broadcaster.
			location: {
				window: { enabled: true },
				peers: { enabled: true },
			},
			chat: {
				// Download the chat of the broadcaster.
				message: { enabled: true },
				// And download the typing indicator.
				typing: { enabled: true },
			},
			// Download the preview track to receive high-level information about the broadcaster.
			preview: { enabled: true },
			audio: {
				enabled: this.space.sound.suspended,
				// Download the speaking indicator.
				speaking: { enabled: true },
				captions: { enabled: Settings.captions.render },
			},
			// Download the user information.
			user: {
				enabled: true,
			},
			video: {
				enabled: this.space.canvas.visible,
			},
		});

		const broadcast = new Broadcast(watch, this.space.canvas, this.space.sound, {
			visible: true,
		});

		// Request the position we should use from this remote broadcast.
		broadcast.signals.effect((effect) => {
			const positions = effect.get(broadcast.source.location.peers.positions);
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

		this.space.add(path, broadcast);
	}

	close() {
		this.#signals.close();
		this.space.close();
	}
}
