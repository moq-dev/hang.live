import { Catalog } from "@kixelated/hang";
import { Effect, Signal } from "@kixelated/signals";
import { Broadcast } from "./broadcast";
import { Canvas } from "./canvas";
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
		media: new Signal<MediaStream | undefined>(undefined),
		root: new Signal(undefined),
		caption: new Signal<string | undefined>(undefined),
	};

	video = {
		media: new Signal<MediaStream | undefined>(undefined),
		active: new Signal(false),
		frame: () => undefined,
	};

	signals = new Effect();

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

	close() {
		this.signals.close();
	}
}

export class FakeRoom {
	space: Space;

	constructor(canvas: Canvas) {
		this.space = new Space(canvas);
	}

	add(name: string, broadcast: FakeBroadcast) {
		this.space.add(name, new Broadcast(broadcast, this.space.canvas));
	}

	remove(name: string) {
		this.space.remove(name);
	}

	close() {
		this.space.close();
	}
}
