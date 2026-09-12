import * as Moq from "@moq/net";
import { Room as MoqRoom } from "@moq/room";
import { Effect, Signal } from "@moq/signals";
import { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { HangLocalSource, Local } from "./local";
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
	connection: Moq.Connection.Reload;
	local: Local;
	space: Space;

	#cameraBroadcast = new Signal<Broadcast<HangLocalSource> | undefined>(undefined);
	#shareBroadcast = new Signal<Broadcast<HangLocalSource> | undefined>(undefined);
	#roster: MoqRoom;
	#signals = new Effect();

	constructor(props: RoomProps) {
		this.connection = props.connection;
		this.local = props.local;
		this.space = new Space(props.canvas, props.sound);

		this.#roster = new MoqRoom({
			connection: this.connection,
			identity: this.local.identity,
			enabled: Local.join,
		});
		this.#signals.cleanup(() => this.#roster.close());

		this.#signals.run((effect) => {
			if (!effect.get(Local.join)) {
				const all = this.space.clear();
				for (const broadcast of all) {
					broadcast.close();
				}
				return;
			}

			const cameraPath = effect.get(this.local.camera.name);
			const camera = this.space.add(cameraPath, this.local.camera);
			this.#cameraBroadcast.set(camera as Broadcast<HangLocalSource>);
			effect.cleanup(() => {
				void this.space.remove(cameraPath);
				this.#cameraBroadcast.set(undefined);
			});
		});

		this.#signals.run((effect) => {
			if (!effect.get(Local.join)) return;
			if (!effect.get(this.local.core.share.out.source)) return;

			const sharePath = effect.get(this.local.share.name);
			const share = this.space.add(sharePath, this.local.share);
			this.#shareBroadcast.set(share as Broadcast<HangLocalSource>);
			effect.cleanup(() => {
				void this.space.remove(sharePath);
				this.#shareBroadcast.set(undefined);
			});
		});

		this.#signals.run((effect) => {
			if (!effect.get(Local.join)) return;
			const remotes = effect.get(this.#roster.remotes);
			for (const remote of remotes.values()) {
				effect.run((effect) => {
					const camera = effect.get(remote.camera);
					if (!camera) return;
					this.#addRemote(camera.path);
					effect.cleanup(() => {
						void this.space.remove(camera.path);
					});
				});
				effect.run((effect) => {
					const screen = effect.get(remote.screen);
					if (!screen) return;
					this.#addRemote(screen.path);
					effect.cleanup(() => {
						void this.space.remove(screen.path);
					});
				});
			}
		});

		this.#signals.timer(() => {
			this.space.sound.tts.enabled.set(true);
		}, 1000);

		this.#signals.run((effect) => {
			const cameraBroadcast = effect.get(this.#cameraBroadcast);
			if (!cameraBroadcast) return;
			const locator = new Locator(cameraBroadcast);
			effect.cleanup(() => locator.close());
			effect.timer(() => locator.close(), 8000);
		});

		this.#signals.run((effect) => {
			const shareBroadcast = effect.get(this.#shareBroadcast);
			if (!shareBroadcast) return;
			const locator = new Locator(shareBroadcast);
			effect.cleanup(() => locator.close());
			effect.timer(() => locator.close(), 8000);
		});

		this.#signals.run((effect) => {
			if (effect.get(this.local.core.webcam.out.source) || effect.get(this.local.core.microphone.out.source)) {
				this.space.sound.notification("select");
			}
		});

		this.#signals.run((effect) => {
			if (effect.get(this.local.core.share.out.source)) {
				this.space.sound.notification("select");
			}
		});
	}

	#addRemote(path: Moq.Path.Valid) {
		if (this.space.lookup.has(path)) return;

		const watch = new WatchBroadcast({
			connection: this.connection.established,
			enabled: true,
			name: path,
			reload: false,
			audio: { enabled: this.space.sound.enabled },
			video: { enabled: this.space.canvas.visible },
		});

		watch.signals.run((effect) => {
			const positions = effect.get(watch.location.peers.positions);
			if (!positions) return;

			const camera = effect.get(this.local.camera.location.window.handle);
			const screen = effect.get(this.local.share.location.window.handle);

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
