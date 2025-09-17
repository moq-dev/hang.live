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
	sound: Sound;

	enabled = new Signal(false);

	location = {
		current: new Signal<Catalog.Position | undefined>(undefined),
		handle: new Signal<string | undefined>(undefined),
	};

	chat = {
		message: {
			enabled: new Signal(true),
			latest: new Signal<string | undefined>(undefined),
		},
		typing: {
			enabled: new Signal(true),
			active: new Signal<boolean | undefined>(undefined),
		},
	};

	user = new Signal<Catalog.User | undefined>(undefined);

	audio = {
		root: new Signal<AudioNode | undefined>(undefined),
		captions: {
			enabled: new Signal(true),
			text: new Signal<string | undefined>(undefined),
		},
		speaking: {
			enabled: new Signal(false),
			active: new Signal<boolean | undefined>(undefined),
		},
	};

	video = {
		media: new Signal<MediaStream | undefined>(undefined),
		active: new Signal(false),
		frame: new Signal<HTMLVideoElement | undefined>(undefined),
		flip: new Signal<boolean | undefined>(undefined),
		detection: {
			enabled: new Signal(false),
			objects: new Signal<Catalog.DetectionObjects | undefined>(undefined),
		},
	};

	signals = new Effect();

	#video: HTMLVideoElement | undefined;

	constructor(sound: Sound, props?: FakeBroadcastProps) {
		this.sound = sound;

		this.user.set(props?.user);
		this.location.current.set(props?.location);
		this.location.handle.set(Math.random().toString(36).substring(2, 15));

		this.signals.effect((effect) => {
			const message = effect.get(this.chat.message.latest);
			if (!message) return;

			effect.timer(() => this.chat.message.latest.set(undefined), 10000);
		});

		this.signals.effect((effect) => {
			const caption = effect.get(this.audio.captions.text);
			if (!caption) return;

			effect.timer(() => this.audio.captions.text.set(undefined), 10000);
		});

		// A helper to automatically unset the typing indicator when the message is sent.
		this.signals.effect((effect) => {
			const message = effect.get(this.chat.message.latest);
			if (message) this.chat.typing.active.set(false);
		});
	}

	play(src: URL) {
		const video = document.createElement("video");
		video.src = src.toString();

		if (this.sound.suspended.peek()) {
			video.muted = true;
			this.signals.effect((effect) => {
				video.muted = effect.get(this.sound.suspended);
			});
		}

		video.playsInline = true;
		video.autoplay = true;
		video.volume = 0.25;
		video.load();
		video.play();

		this.#video = video;
		this.video.active.set(true);
		this.video.frame.set(video);

		const source = new MediaElementAudioSourceNode(this.sound.context, { mediaElement: video });
		this.audio.root.set(source);
	}

	stop() {
		this.#video?.pause();
		this.#video = undefined;

		this.video.active.set(false);
		this.video.frame.set(undefined);

		this.audio.root.update((prev) => {
			prev?.disconnect();
			return undefined;
		});
	}

	close() {
		this.signals.close();
	}
}

export class FakeRoom {
	space: Space;
	sound: Sound;

	constructor(canvas: Canvas) {
		this.sound = new Sound({ tts: { enabled: true } });
		this.space = new Space(canvas, this.sound);
	}

	create(props?: FakeBroadcastProps): FakeBroadcast {
		return new FakeBroadcast(this.sound, props);
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
