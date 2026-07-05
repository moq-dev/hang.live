import type { Root as CatalogRoot } from "@moq/hang/catalog";
import * as Json from "@moq/json";
import type * as Moq from "@moq/lite";
import * as Publish from "@moq/publish";
import { Effect, type Getter, Signal } from "@moq/signals";
import * as Watch from "@moq/watch";

const TRACKS = {
	user: "hang/user.json",
	location: "hang/location.json",
	chat: "hang/chat.json",
	preview: "hang/preview.json",
} as const;

const HANG_PRIORITY = 90;

export type Position = {
	x?: number;
	y?: number;
	z?: number;
	s?: number;
};

export type User = {
	id?: string;
	name?: string;
	avatar?: string;
	color?: string;
};

export type LocationValue = {
	window?: {
		position?: Position;
		handle?: string;
	};
	peers?: {
		positions?: Record<string, Position>;
	};
};

export type ChatValue = {
	message?: string;
	typing?: boolean;
};

export type PreviewInfo = {
	audio?: boolean;
	video?: boolean;
	chat?: boolean;
	typing?: boolean;
	screen?: boolean;
	name?: string;
	avatar?: string;
};

export type PreviewValue = {
	info?: PreviewInfo;
};

type TrackRef = {
	track: string;
};

type HangCatalog = {
	user?: TrackRef;
	location?: TrackRef;
	chat?: TrackRef;
	preview?: TrackRef;
};

type ExtendedCatalog = CatalogRoot & {
	hang?: HangCatalog;
};

export type MetadataProps = {
	user?: {
		enabled?: boolean | Signal<boolean>;
		id?: string | Signal<string | undefined>;
		name?: string | Signal<string | undefined>;
		avatar?: string | Signal<string | undefined>;
		color?: string | Signal<string | undefined>;
	};
	location?: {
		window?: {
			enabled?: boolean | Signal<boolean>;
			position?: Position | Signal<Position | undefined>;
			handle?: string | Signal<string | undefined>;
		};
		peers?: {
			enabled?: boolean | Signal<boolean>;
			positions?: Record<string, Position> | Signal<Record<string, Position> | undefined>;
		};
	};
	chat?: {
		message?: {
			enabled?: boolean | Signal<boolean>;
			latest?: string | Signal<string | undefined>;
		};
		typing?: {
			enabled?: boolean | Signal<boolean>;
			active?: boolean | Signal<boolean | undefined>;
		};
	};
	preview?: {
		enabled?: boolean | Signal<boolean>;
		info?: PreviewInfo | Signal<PreviewInfo>;
	};
};

export type Metadata = {
	user: {
		id: Signal<string | undefined>;
		name: Signal<string | undefined>;
		avatar: Signal<string | undefined>;
		color: Signal<string | undefined>;
	};
	location: {
		window: {
			enabled: Signal<boolean>;
			position: Signal<Position | undefined>;
			handle: Signal<string | undefined>;
		};
		peers: {
			enabled: Signal<boolean>;
			positions: Signal<Record<string, Position> | undefined>;
		};
	};
	chat: {
		message: {
			enabled: Signal<boolean>;
			latest: Signal<string | undefined>;
		};
		typing: {
			enabled: Signal<boolean>;
			active: Signal<boolean | undefined>;
		};
	};
	preview: {
		enabled: Signal<boolean>;
		info: Signal<PreviewInfo>;
	};
};

export type HangPublishBroadcast = Publish.Broadcast & Metadata;

function fromOptional<T>(value: T | Signal<T | undefined> | undefined): Signal<T | undefined> {
	return Signal.from(value);
}

function fromBoolean(value: boolean | Signal<boolean> | undefined, fallback = false): Signal<boolean> {
	return Signal.from(value ?? fallback);
}

function createMetadata(props?: MetadataProps): Metadata {
	return {
		user: {
			id: fromOptional(props?.user?.id),
			name: fromOptional(props?.user?.name),
			avatar: fromOptional(props?.user?.avatar),
			color: fromOptional(props?.user?.color),
		},
		location: {
			window: {
				enabled: fromBoolean(props?.location?.window?.enabled),
				position: fromOptional(props?.location?.window?.position),
				handle: fromOptional(props?.location?.window?.handle),
			},
			peers: {
				enabled: fromBoolean(props?.location?.peers?.enabled),
				positions: fromOptional(props?.location?.peers?.positions),
			},
		},
		chat: {
			message: {
				enabled: fromBoolean(props?.chat?.message?.enabled),
				latest: fromOptional(props?.chat?.message?.latest),
			},
			typing: {
				enabled: fromBoolean(props?.chat?.typing?.enabled),
				active: fromOptional(props?.chat?.typing?.active),
			},
		},
		preview: {
			enabled: fromBoolean(props?.preview?.enabled),
			info: Signal.from(props?.preview?.info ?? {}),
		},
	};
}

export function createPublishBroadcast(props?: Publish.BroadcastProps & MetadataProps): HangPublishBroadcast {
	const broadcast = new Publish.Broadcast(props);
	const metadata = createMetadata(props);
	const extended = Object.assign(broadcast, metadata) as HangPublishBroadcast;

	extended.location.window.handle.set(
		extended.location.window.handle.peek() ?? Math.random().toString(36).substring(2, 15),
	);

	const user = new Json.Producer<User>({ initial: {} });
	const location = new Json.Producer<LocationValue>({ initial: {} });
	const chat = new Json.Producer<ChatValue>({ initial: {} });
	const preview = new Json.Producer<PreviewValue>({ initial: {} });

	const unpublish = [
		extended.publishTrack(TRACKS.user, (track, effect) => user.serve(track, effect)),
		extended.publishTrack(TRACKS.location, (track, effect) => location.serve(track, effect)),
		extended.publishTrack(TRACKS.chat, (track, effect) => chat.serve(track, effect)),
		extended.publishTrack(TRACKS.preview, (track, effect) => preview.serve(track, effect)),
	];

	extended.catalog.mutate((catalog: ExtendedCatalog) => {
		catalog.hang = {
			user: { track: TRACKS.user },
			location: { track: TRACKS.location },
			chat: { track: TRACKS.chat },
			preview: { track: TRACKS.preview },
		};
	});

	extended.signals.effect((effect) => {
		user.update({
			id: effect.get(extended.user.id),
			name: effect.get(extended.user.name),
			avatar: effect.get(extended.user.avatar),
			color: effect.get(extended.user.color),
		});
	});

	extended.signals.effect((effect) => {
		location.update({
			window: {
				position: effect.get(extended.location.window.position),
				handle: effect.get(extended.location.window.handle),
			},
			peers: {
				positions: effect.get(extended.location.peers.positions),
			},
		});
	});

	extended.signals.effect((effect) => {
		chat.update({
			message: effect.get(extended.chat.message.latest),
			typing: effect.get(extended.chat.typing.active),
		});
	});

	extended.signals.effect((effect) => {
		preview.update({
			info: effect.get(extended.preview.info),
		});
	});

	extended.signals.cleanup(() => {
		for (const stop of unpublish) stop();
		user.finish();
		location.finish();
		chat.finish();
		preview.finish();
	});

	return extended;
}

export function createWatchMetadata(
	broadcast: Watch.Broadcast,
	props?: MetadataProps,
): Metadata & { close: () => void } {
	const metadata = createMetadata(props);
	const signals = new Effect();

	signals.effect((effect) => {
		const catalog = effect.get(broadcast.catalog) as ExtendedCatalog | undefined;
		const hang = catalog?.hang;
		if (!hang) return;

		if (hang.user) {
			subscribeJson<User>(broadcast, hang.user.track, effect, (value) => {
				metadata.user.id.set(value.id);
				metadata.user.name.set(value.name);
				metadata.user.avatar.set(value.avatar);
				metadata.user.color.set(value.color);
			});
		}

		if (hang.location) {
			subscribeJson<LocationValue>(broadcast, hang.location.track, effect, (value) => {
				metadata.location.window.position.set(value.window?.position);
				metadata.location.window.handle.set(value.window?.handle);
				metadata.location.peers.positions.set(value.peers?.positions);
			});
		}

		if (hang.chat) {
			subscribeJson<ChatValue>(broadcast, hang.chat.track, effect, (value) => {
				metadata.chat.message.latest.set(value.message);
				metadata.chat.typing.active.set(value.typing);
			});
		}

		if (hang.preview) {
			subscribeJson<PreviewValue>(broadcast, hang.preview.track, effect, (value) => {
				metadata.preview.info.set(value.info ?? {});
			});
		}
	});

	return {
		...metadata,
		close: () => signals.close(),
	};
}

function subscribeJson<T>(broadcast: Watch.Broadcast, name: string, effect: Effect, update: (value: T) => void): void {
	const unsubscribe = broadcast.subscribeTrack(name, HANG_PRIORITY, (track, trackEffect) => {
		const consumer = new Json.Consumer<T>(track);
		trackEffect.spawn(async () => {
			for (;;) {
				const value = await Promise.race([trackEffect.cancel, consumer.next()]);
				if (value === undefined) break;

				update(value);
			}
		});
	});

	effect.cleanup(unsubscribe);
}

export type BroadcastUser = Metadata["user"];
export type BroadcastLocation = Metadata["location"];
export type BroadcastChat = Metadata["chat"];
export type BroadcastPreview = Metadata["preview"];
export type BroadcastActive = Getter<Moq.Broadcast | undefined>;
