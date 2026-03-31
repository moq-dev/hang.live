import { Catalog } from "@moq/hang";
import type * as Moq from "@moq/lite";
import { Effect, type Getter, Signal } from "@moq/signals";
import * as Watch from "@moq/watch";

// Props for creating a WatchBroadcast
export interface WatchBroadcastProps {
	connection?: Moq.Connection.Established | Signal<Moq.Connection.Established | undefined>;
	enabled?: boolean | Signal<boolean>;
	name?: Moq.Path.Valid | Signal<Moq.Path.Valid>;
	reload?: boolean | Signal<boolean>;
	location?: {
		window?: { enabled?: boolean | Signal<boolean> };
		peers?: { enabled?: boolean | Signal<boolean> };
	};
	chat?: {
		message?: { enabled?: boolean | Signal<boolean> };
		typing?: { enabled?: boolean | Signal<boolean> };
	};
	preview?: { enabled?: boolean | Signal<boolean> };
	audio?: { enabled?: boolean | Signal<boolean> };
	video?: { enabled?: boolean | Signal<boolean> };
}

// Composes the new standalone Watch modules into a single object
// with an interface compatible with Publish.Broadcast and FakeBroadcast.
export class WatchBroadcast {
	// The underlying Watch.Broadcast (handles connection, path, catalog)
	#broadcast: Watch.Broadcast;

	// Sync for audio/video timing
	#sync: Watch.Sync;

	// Proxied signals from Watch.Broadcast (Getter -> Signal for sub-modules)
	#active = new Signal<Moq.Broadcast | undefined>(undefined);
	#catalog = new Signal<Catalog.Root | undefined>(undefined);

	// Sub-modules
	#videoSource: Watch.Video.Source;
	#videoDecoder: Watch.Video.Decoder;
	#audioSource: Watch.Audio.Source;
	#audioDecoder: Watch.Audio.Decoder;
	#preview: Watch.Preview;

	// Location (public - accessed directly)
	location: Watch.Location.Root;

	// Chat (public - accessed directly)
	chat: Watch.Chat.Chat;

	// User info extracted from catalog
	#userId = new Signal<string | undefined>(undefined);
	#userName = new Signal<string | undefined>(undefined);
	#userAvatar = new Signal<string | undefined>(undefined);
	#userColor = new Signal<string | undefined>(undefined);

	// Video flip flag derived from catalog
	#flip = new Signal<boolean>(false);

	signals = new Effect();

	// Unified video interface combining Source + Decoder properties
	video: {
		frame: Getter<VideoFrame | undefined>;
		display: Getter<{ width: number; height: number } | undefined>;
		catalog: Getter<Catalog.Video | undefined>;
		target: Signal<Watch.Video.Target | undefined>;
		active: Getter<string | undefined>;
		flip: Signal<boolean>;
	};

	// Unified audio interface combining Source + Decoder properties
	audio: {
		root: Getter<AudioNode | undefined>;
		catalog: Getter<Catalog.Audio | undefined>;
		active: Signal<string | undefined>;
	};

	// User info
	user: {
		id: Getter<string | undefined>;
		name: Getter<string | undefined>;
		avatar: Getter<string | undefined>;
		color: Getter<string | undefined>;
	};

	constructor(props?: WatchBroadcastProps) {
		// Create the underlying broadcast (connection, path, catalog only)
		this.#broadcast = new Watch.Broadcast({
			connection: props?.connection,
			enabled: props?.enabled,
			name: props?.name,
			reload: props?.reload,
		});

		// Proxy active and catalog from Getter to Signal for sub-modules
		this.signals.effect((effect) => {
			effect.set(this.#active, effect.get(this.#broadcast.active));
		});

		this.signals.effect((effect) => {
			effect.set(this.#catalog, effect.get(this.#broadcast.catalog));
		});

		// Create Sync for audio/video timing
		this.#sync = new Watch.Sync();

		// Create Video Source + Decoder
		this.#videoSource = new Watch.Video.Source(this.#sync, {
			broadcast: this.#broadcast,
		});
		this.#videoDecoder = new Watch.Video.Decoder(this.#videoSource, {
			enabled: props?.video?.enabled,
		});

		// Create Audio Source + Decoder
		this.#audioSource = new Watch.Audio.Source(this.#sync, {
			broadcast: this.#broadcast,
		});
		this.#audioDecoder = new Watch.Audio.Decoder(this.#audioSource, {
			enabled: props?.audio?.enabled,
		});

		// Create Location
		this.location = new Watch.Location.Root(this.#active, this.#catalog, props?.location);

		// Create Chat
		this.chat = new Watch.Chat.Chat(this.#active, this.#catalog, props?.chat);

		// Create Preview
		this.#preview = new Watch.Preview(this.#active, this.#catalog, props?.preview);

		// Extract user info from catalog
		this.signals.effect((effect) => {
			const catalog = effect.get(this.#catalog);
			this.#userId.set(catalog?.user?.id);
			this.#userName.set(catalog?.user?.name);
			this.#userAvatar.set(catalog?.user?.avatar);
			this.#userColor.set(catalog?.user?.color);
		});

		// Derive flip from video catalog
		this.signals.effect((effect) => {
			const catalog = effect.get(this.#videoSource.catalog);
			this.#flip.set(catalog?.flip ?? false);
		});

		// Build unified interfaces
		this.video = {
			frame: this.#videoDecoder.frame,
			display: this.#videoDecoder.display,
			catalog: this.#videoSource.catalog,
			target: this.#videoSource.target,
			active: this.#videoSource.track,
			flip: this.#flip,
		};

		this.audio = {
			root: this.#audioDecoder.root,
			catalog: this.#audioSource.catalog,
			active: this.#audioSource.track,
		};

		this.user = {
			id: this.#userId,
			name: this.#userName,
			avatar: this.#userAvatar,
			color: this.#userColor,
		};
	}

	close() {
		this.signals.close();
		this.#sync.close();
		this.#videoDecoder.close();
		this.#videoSource.close();
		this.#audioDecoder.close();
		this.#audioSource.close();
		this.location.close();
		this.chat.close();
		this.#preview.close();
		this.#broadcast.close();
	}
}
