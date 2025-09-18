import type * as Moq from "@kixelated/moq";
import { Path } from "@kixelated/moq";
import { Effect, Signal } from "@kixelated/signals";
import { Member } from "./member";

export interface RoomProps {
	connection: Moq.Connection.Established | Signal<Moq.Connection.Established | undefined>;
	name?: Path.Valid | Signal<Path.Valid | undefined>;
	enabled?: boolean | Signal<boolean>;
}

export class Room {
	connection: Signal<Moq.Connection.Established | undefined>;
	name: Signal<Path.Valid | undefined>;
	enabled: Signal<boolean>;

	#members = new Map<Path.Valid, Member>();

	#onMember?: (name: Path.Valid, member: Member | undefined) => void;
	#signals = new Effect();

	constructor(props?: RoomProps) {
		this.connection = Signal.from(props?.connection);
		this.name = Signal.from(props?.name);
		this.enabled = Signal.from(props?.enabled ?? false);

		this.#signals.effect(this.#init.bind(this));
	}

	onMember(callback?: (name: Path.Valid, member: Member | undefined) => void) {
		this.#onMember = callback;
		if (!callback) return;

		for (const [name, member] of this.#members) {
			callback(name, member);
		}
	}

	#init(effect: Effect) {
		if (!effect.get(this.enabled)) return;

		const conn = effect.get(this.connection);
		if (!conn) return;

		const name = effect.get(this.name);

		effect.spawn(this.#runMembers.bind(this, conn, name));
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

			const member = new Member(broadcast, { enabled: true });
			member.signals.effect((effect) => {
				member.enabled.set(effect.get(this.enabled));
			});

			this.#members.set(update.name, member);

			this.#onMember?.(update.name, member);
		} else {
			const existing = this.#members.get(update.name);
			if (!existing) return;

			existing.close();
			this.#members.delete(update.name);

			this.#onMember?.(update.name, undefined);
		}
	}

	close() {
		this.#signals.close();

		for (const [name, member] of this.#members) {
			member.close();
			this.#onMember?.(name, undefined);
		}

		this.#members = new Map();
	}
}
