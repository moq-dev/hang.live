import * as Moq from "@moq/net";
import { Room as MoqRoom, type Remote } from "@moq/room";
import type { Getter } from "@moq/signals";

export interface RoomProps {
	connection: Moq.Connection.Reload;
	path?: Moq.Path.Valid;
	enabled?: boolean;
}

/** Preview roster: `@moq/room` Room over a connection that may span several rooms. */
export class Room {
	#roster: MoqRoom;

	constructor(props: RoomProps) {
		this.#roster = new MoqRoom({
			connection: props.connection,
			prefix: props.path,
			enabled: props.enabled ?? true,
		});
	}

	get members(): Getter<Map<Moq.Path.Valid, Remote>> {
		return this.#roster.remotes;
	}

	close() {
		this.#roster.close();
	}
}
