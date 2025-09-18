import type * as Moq from "@kixelated/moq";
import { Path } from "@kixelated/moq";
import { Effect, Getter, Signal } from "@kixelated/signals";
import { Member } from "./member";

export interface RoomProps {
	connection: Moq.Connection.Established | Signal<Moq.Connection.Established | undefined>;
	path?: Path.Valid | Signal<Path.Valid | undefined>;
	enabled?: boolean | Signal<boolean>;
}

export class Room {
	connection: Signal<Moq.Connection.Established | undefined>;
	path: Signal<Path.Valid | undefined>;
	enabled: Signal<boolean>;

	#members = new Signal(new Map<Path.Valid, Member>());
	#signals = new Effect();

	constructor(props?: RoomProps) {
		this.connection = Signal.from(props?.connection);
		this.path = Signal.from(props?.path);
		this.enabled = Signal.from(props?.enabled ?? false);

		this.#signals.effect(this.#init.bind(this));
	}

	#init(effect: Effect) {
		if (!effect.get(this.enabled)) return;

		const conn = effect.get(this.connection);
		if (!conn) return;

		const path = effect.get(this.path);

		effect.spawn(this.#runMembers.bind(this, conn, path));
	}

	async #runMembers(connection: Moq.Connection.Established, name?: Moq.Path.Valid) {
		const announced = connection.announced(name);

		try {
			for (;;) {
				const update = await announced.next();
				if (!update) break;

				this.#handleUpdate(connection, update);
			}
		} finally {
			announced.close();
			this.close();
		}
	}

	#handleUpdate(connection: Moq.Connection.Established, update: Moq.AnnouncedEntry) {
		if (update.active) {
			const broadcast = connection.consume(update.name);
			const member = new Member(broadcast, { enabled: this.enabled });

			// Only add the member when they're publishing preview info.
			member.signals.effect((effect) => {
				const active = effect.get(member.active);
				if (!active) return;

				console.log("adding member", update.name);
				this.#members.mutate((members) => members.set(update.name, member));
				effect.cleanup(() => {
					this.#members.mutate((members) => members.delete(update.name));
					console.log("removing member", update.name);
				});
			});
		} else {
			this.#members.peek().get(update.name)?.close();
			// cleanup will remove the member from the map, but do it manually just in case
			this.#members.mutate((members) => members.delete(update.name));
		}
	}

	get members(): Getter<Map<Path.Valid, Member>> {
		return this.#members;
	}

	close() {
		this.#signals.close();

		for (const member of this.#members.peek().values()) {
			member.close();
		}
	}
}
