import * as Clock from "@moq/clock";
import * as Moq from "@moq/net";
import { parse } from "@moq/room";
import { Effect, Signal } from "@moq/signals";
import { Broadcast } from "./broadcast";
import type { Canvas } from "./canvas";
import { HangLocalSource, Local } from "./local";
import { Locator } from "./locator";
import * as Peers from "./peers";
import { Sound } from "./sound";
import { Space } from "./space";
import { WatchBroadcast } from "./watch";

export interface RoomProps {
	connection: Moq.Connection;
	canvas: Canvas;
	sound: Sound;
	local: Local;
}

export class Room {
	connection: Moq.Connection;
	local: Local;
	space: Space;

	#cameraBroadcast = new Signal<Broadcast<HangLocalSource> | undefined>(undefined);
	#shareBroadcast = new Signal<Broadcast<HangLocalSource> | undefined>(undefined);
	#signals = new Effect();

	constructor(props: RoomProps) {
		this.connection = props.connection;
		this.local = props.local;
		this.space = new Space(props.canvas, props.sound);

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
			if (!effect.get(this.local.screen.out.source)) return;

			const sharePath = effect.get(this.local.share.name);
			const share = this.space.add(sharePath, this.local.share);
			this.#shareBroadcast.set(share as Broadcast<HangLocalSource>);
			effect.cleanup(() => {
				void this.space.remove(sharePath);
				this.#shareBroadcast.set(undefined);
			});
		});

		// Discover remote broadcasts ourselves: `@moq/room`'s roster would open a second watch per
		// broadcast, painting to a canvas Hang does not use.
		this.#signals.run((effect) => {
			if (!effect.get(Local.join)) return;
			const origin = effect.get(this.connection.origin);
			if (!origin) return;
			const local = effect.get(this.local.identity);

			// The connection URL already carries the room, so the whole origin is the room.
			const announced = origin.announced(Moq.Path.Pattern.subtree(Moq.Path.empty()));
			effect.cleanup(() => announced.close());

			const remotes = new Set<Moq.Path.Valid>();
			effect.cleanup(() => {
				for (const path of remotes) void this.space.remove(path).then((source) => source?.close());
			});

			effect.spawn(async () => {
				for (;;) {
					const update = await effect.race(announced.next());
					if (!update) break;

					// Same capture handling as `@moq/room`: a broad route that cannot pin the suffix names
					// no participant to open.
					const capture = update.captures?.[0];
					const suffix = capture?.isLiteral ? capture.text : capture?.asPrefix();
					if (suffix === undefined) continue;
					const path = Moq.Path.from(suffix);
					const parsed = parse(path);
					if (!parsed || parsed.identity === local) continue;

					if (update.kind === "present") {
						if (remotes.has(path)) continue;
						remotes.add(path);
						this.#addRemote(path);
					} else if (remotes.delete(path)) {
						void this.space.remove(path).then((source) => source?.close());
					}
				}
			});
		});

		this.#signals.timer(() => {
			this.space.sound.tts.enabled.set(true);
		}, Clock.Duration.millis(1000));

		this.#signals.run((effect) => {
			const cameraBroadcast = effect.get(this.#cameraBroadcast);
			if (!cameraBroadcast) return;
			const locator = new Locator(cameraBroadcast);
			effect.cleanup(() => locator.close());
			effect.timer(() => locator.close(), Clock.Duration.millis(8000));
		});

		this.#signals.run((effect) => {
			const shareBroadcast = effect.get(this.#shareBroadcast);
			if (!shareBroadcast) return;
			const locator = new Locator(shareBroadcast);
			effect.cleanup(() => locator.close());
			effect.timer(() => locator.close(), Clock.Duration.millis(8000));
		});

		this.#signals.run((effect) => {
			if (effect.get(this.local.webcam.out.source) || effect.get(this.local.microphone.out.source)) {
				this.space.sound.notification("select");
			}
		});

		this.#signals.run((effect) => {
			if (effect.get(this.local.screen.out.source)) {
				this.space.sound.notification("select");
			}
		});
	}

	#addRemote(path: Moq.Path.Valid) {
		if (this.space.lookup.has(path)) return;

		const watch = new WatchBroadcast({
			connection: this.connection,
			name: path,
			audio: this.space.sound.enabled,
			video: this.space.canvas.visible,
		});

		// Follow the moves this peer asks of each local window, while Remote Control allows it.
		for (const local of [this.local.camera, this.local.share]) {
			const target = local.location.window;
			const inbox = new Peers.Inbox(target);
			watch.signals.cleanup(() => inbox.close());

			watch.signals.run((effect) => {
				const handle = effect.get(target.handle);
				const movable = effect.get(target.movable);
				const request = handle && movable ? effect.get(watch.location.peers.positions)?.[handle] : undefined;
				inbox.receive(request);
			});
		}

		this.space.add(path, watch);
	}

	close() {
		this.#signals.close();
		this.space.close();
	}
}
