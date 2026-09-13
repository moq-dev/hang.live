import * as Moq from "@moq/net";
import type * as Publish from "@moq/publish";
import { Local as RoomLocal } from "@moq/room";
import { Effect, type Getter, Signal } from "@moq/signals";
import Settings from "../settings";
import { type ChatFields, chatFields, type LocationFields, locationFields, serveExtras } from "./metadata";

export interface LocalProps {
	connection?: Signal<Moq.Connection.Established | undefined> | Moq.Connection.Established;
	identity?: Signal<Moq.Path.Valid> | Moq.Path.Valid;
	name?: Signal<string | undefined> | string;
	avatar?: Signal<string | undefined> | string;
}

/**
 * Local camera and screen, wrapping `@moq/room` Local and adding hang.live
 * location/chat catalog extras plus the 3D-layer source shape.
 */
export class Local {
	readonly core: RoomLocal;
	readonly identity: Signal<Moq.Path.Valid>;

	readonly camera: HangLocalSource;
	readonly share: HangLocalSource;

	readonly name: Signal<string | undefined>;
	readonly avatar: Signal<string | undefined>;

	static join = new Signal<boolean>(false);

	#signals = new Effect();

	constructor(props?: LocalProps) {
		this.identity = Signal.from(props?.identity ?? Moq.Path.from("pending"));
		this.name = Signal.from(props?.name ?? Settings.account.name);
		this.avatar = Signal.from(props?.avatar ?? Settings.account.avatar);

		this.core = new RoomLocal({
			connection: Signal.from(props?.connection),
			identity: this.identity,
			enabled: Local.join,
			cameraEnabled: Settings.camera.enabled,
			microphoneEnabled: Settings.microphone.enabled,
			user: {
				name: this.name,
				avatar: this.avatar,
			},
		});
		this.#signals.cleanup(() => this.core.close());
		this.#signals.run((effect) => {
			this.core.webcam.device.preferred.set(effect.get(Settings.camera.device));
			this.core.microphone.device.preferred.set(effect.get(Settings.microphone.device));
		});
		this.#signals.run((effect) => {
			Settings.camera.device.set(effect.get(this.core.webcam.device.preferred));
			Settings.microphone.device.set(effect.get(this.core.microphone.device.preferred));
		});
		this.#signals.run((effect) => {
			this.core.cameraAudio.volume.set(effect.get(Settings.microphone.gain));
		});

		this.camera = new HangLocalSource({
			broadcast: this.core.camera,
			frame: this.core.cameraCapture.out.frame,
			display: this.core.cameraCapture.out.display,
			audioRoot: this.core.cameraAudio.out.root,
			videoSource: this.core.webcam.out.source,
			audioSource: this.core.microphone.out.source,
			user: this.core.user,
			flip: true,
			enabled: this.core.enabled,
		});
		this.#signals.cleanup(() => this.camera.close());

		const shareName = new Signal<string | undefined>(undefined);
		this.share = new HangLocalSource({
			broadcast: this.core.screen,
			frame: this.core.screenCapture.out.frame,
			display: this.core.screenCapture.out.display,
			audioRoot: this.core.screenAudio.out.root,
			videoSource: new Signal<unknown>(undefined),
			audioSource: new Signal<unknown>(undefined),
			user: {
				id: this.core.user.id,
				name: shareName,
				avatar: this.core.user.avatar,
				color: this.core.user.color,
			},
			flip: false,
			enabled: this.core.screenEnabled,
		});
		this.#signals.cleanup(() => this.share.close());

		this.#signals.run((effect) => {
			const source = effect.get(this.core.share.out.source);
			(this.share.video.source as Signal<unknown>).set(source?.video);
			(this.share.audio.source as Signal<unknown>).set(source?.audio);
		});

		this.camera.signals.run((effect) => {
			const message = effect.get(this.camera.chat.message.latest);
			this.core.chatting.set(!!message);
			if (!message) return;
			effect.timer(() => {
				this.camera.chat.message.latest.set("");
			}, 10000);
		});

		this.#signals.run((effect) => {
			const name = effect.get(Settings.account.name);
			if (!name) return;
			shareName.set(`${name.endsWith("s") ? `${name}' Screen` : `${name}'s Screen`} (screen)`);
		});
	}

	get webcam() {
		return this.core.webcam;
	}

	get microphone() {
		return this.core.microphone;
	}

	get screen() {
		return this.core.share;
	}

	close() {
		this.#signals.close();
	}
}

export interface HangLocalSourceProps {
	broadcast: Publish.Broadcast;
	frame: Getter<VideoFrame | undefined>;
	display: Getter<{ width: number; height: number } | undefined>;
	audioRoot: Getter<AudioNode | undefined>;
	videoSource: Getter<unknown>;
	audioSource: Getter<unknown>;
	user: {
		id: Getter<string | undefined>;
		name: Signal<string | undefined>;
		avatar: Getter<string | undefined>;
		color: Getter<string | undefined>;
	};
	flip: boolean;
	enabled: Getter<boolean>;
}

/** Publish-side source the 3D layer reads: room Local plus location/chat. */
export class HangLocalSource {
	readonly role = "publish" as const;
	readonly broadcast: Publish.Broadcast;
	readonly location: LocationFields;
	readonly chat: ChatFields;
	readonly user: HangLocalSourceProps["user"];
	readonly video: {
		frame: Getter<VideoFrame | undefined>;
		display: Getter<{ width: number; height: number } | undefined>;
		flip: Getter<boolean>;
		source: Getter<unknown>;
		catalog: Getter<undefined>;
		target: Signal<undefined>;
		active: Getter<undefined>;
	};
	readonly audio: {
		root: Getter<AudioNode | undefined>;
		source: Getter<unknown>;
		catalog: Getter<undefined>;
		active: Getter<undefined>;
	};
	readonly enabled: Getter<boolean>;
	readonly signals = new Effect();

	constructor(props: HangLocalSourceProps) {
		this.broadcast = props.broadcast;
		this.enabled = props.enabled;
		this.location = locationFields();
		this.chat = chatFields();
		this.user = props.user;

		this.video = {
			frame: props.frame,
			display: props.display,
			flip: new Signal(props.flip),
			source: props.videoSource,
			catalog: new Signal(undefined),
			target: new Signal(undefined),
			active: new Signal(undefined),
		};
		this.audio = {
			root: props.audioRoot,
			source: props.audioSource,
			catalog: new Signal(undefined),
			active: new Signal(undefined),
		};

		this.signals.run((effect) => {
			this.location.peers.enabled.set(effect.get(Settings.draggable));
		});

		serveExtras(this.broadcast, this.location, this.chat, this.signals);
	}

	get name(): Getter<Moq.Path.Valid> {
		return this.broadcast.in.name;
	}

	close() {
		this.signals.close();
	}
}
