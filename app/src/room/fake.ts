import { Catalog } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";
import { Sound } from "./sound";
import { Space } from "./space";

export type FakeBroadcastProps = {
	location?: Catalog.Position;
	user?: Catalog.User;
};

export class FakeBroadcast {
	enabled = new Signal(true);

	location = {
		current: new Signal<Catalog.Position | undefined>(undefined),
		handle: new Signal<string | undefined>(undefined),
	};

	chat = {
		enabled: new Signal(true),
		message: new Signal<string | undefined>(undefined),
	};

	user = new Signal<Catalog.User | undefined>(undefined);

	audio = {
		root: new Signal<AudioNode | undefined>(undefined),
		caption: new Signal<string | undefined>(undefined),
	};

	video = {
		media: new Signal<MediaStream | undefined>(undefined),
		active: new Signal(false),
		frame: (): { frame: HTMLVideoElement } | undefined => {
			if (!this.#video) return undefined;
			return { frame: this.#video };
		},
	};

	signals = new Effect();

	#video: HTMLVideoElement | undefined;

	constructor(props?: FakeBroadcastProps) {
		this.user.set(props?.user);
		this.location.current.set(props?.location);
		this.location.handle.set(Math.random().toString(36).substring(2, 15));

		this.signals.effect((effect) => {
			const message = effect.get(this.chat.message);
			if (!message) return;

			effect.timer(() => this.chat.message.set(undefined), 5000);
		});

		this.signals.effect((effect) => {
			const caption = effect.get(this.audio.caption);
			if (!caption) return;

			effect.timer(() => this.audio.caption.set(undefined), 5000);
		});
	}

	play(src: URL) {
		this.#video = document.createElement("video");
		this.#video.src = src.toString();
		this.#video.muted = true;
		this.#video.playsInline = true;
		this.#video.autoplay = true;
		this.#video.load();
		this.#video.play();
		this.video.active.set(true);

		const media = new MediaStream([this.#video])
		this.audio.root.set(this.#video);
	}

	stop() {
		this.#video?.pause();
		this.#video = undefined;
		this.video.active.set(false);
	}

	close() {
		this.signals.close();
	}
}

export class FakeRoom {
	space: Space;
	sound: Sound;

	constructor(canvas: Canvas) {
		this.sound = new Sound();
		this.space = new Space(canvas, this.sound);
	}

	add(name: string, broadcast: FakeBroadcast) {
		this.space.add(name, new Broadcast(broadcast, this.space.canvas, this.sound));
	}

	remove(name: string) {
		this.space.remove(name);
	}

	close() {
		this.space.close();
	}
}
