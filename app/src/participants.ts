import * as Api from "@hang/api-client";
import { Connection, type Moq } from "@kixelated/hang";
import { type Effect, Root, Signal } from "@kixelated/signals";

export interface Participant {
	id: string;
	name: string;
	avatar: string;
	speaking: boolean;
}

export interface ParticipantsBroadcast {
	name: string;
	active: boolean;
}

export type ParticipantsProps = {
	name?: string;
};

export class Participants {
	connection: Connection;
	api: Api.Client;
	name: Signal<string | undefined>;

	// All discovered broadcasts grouped by username
	broadcasts = new Signal<ParticipantsBroadcast[]>([]);

	// Participants derived from broadcasts, grouped by username
	participants = new Signal<Participant[]>([]);

	#signals = new Root();

	constructor(api: Api.Client, props?: ParticipantsProps) {
		this.connection = new Connection();
		this.api = api;
		this.name = new Signal(props?.name);

		this.#signals.effect((effect) => {
			const name = effect.get(this.name);
			if (!name) return;

			// Fetch a token from the API server for the room
			effect.spawn(async () => {
				const response = await this.api.routes.room[":name"].join.$post({ param: { name } });
				if (!response.ok) {
					throw new Error(`Failed to join room: ${response.statusText}`);
				}
				const data = await response.json();

				this.connection.url.set(new URL(data.url));
				effect.cleanup(() => this.connection.url.set(undefined));
			});
		});

		// Convert broadcasts to participants whenever broadcasts change
		this.#signals.effect((effect) => {
			const broadcasts = effect.get(this.broadcasts);

			// Convert to participant list
			const participants: Participant[] = [];
			for (const broadcast of broadcasts) {
				// For now, use a default avatar and no speaking status
				// Speaking status will come from preview.json later
				participants.push({
					id: broadcast.name,
					name: broadcast.name,
					avatar: Api.randomAvatar(), // TODO: Get real avatar from user data
					speaking: false, // TODO: Get from preview.json
				});
			}

			this.participants.set(participants);
		});

		this.#signals.effect(this.#init.bind(this));
	}

	#init(effect: Effect) {
		const connection = effect.get(this.connection.established);
		if (!connection) return;

		const announced = connection.announced();
		effect.cleanup(() => announced.close());

		effect.spawn(this.#runDiscovery.bind(this, announced));
	}

	async #runDiscovery(announced: Moq.AnnouncedConsumer, cancel: Promise<void>) {
		try {
			for (;;) {
				const update = await Promise.race([announced.next(), cancel]);

				// We're done
				if (!update) break;

				// Parse the broadcast path to extract username and device

				const broadcast: ParticipantsBroadcast = {
					name: update.name,
					active: update.active,
				};

				if (update.active) {
					// Add or update the broadcast
					this.broadcasts.set((prev) => {
						const existing = prev.find((b) => b.name === broadcast.name);
						if (existing) {
							// Update existing broadcast
							return prev.map((b) => (b.name === broadcast.name ? broadcast : b));
						} else {
							// Add new broadcast
							return [...prev, broadcast];
						}
					});
				} else {
					// Remove the broadcast
					this.broadcasts.set((prev) => prev.filter((b) => b.name !== broadcast.name));
				}
			}
		} finally {
			// Clean up on exit
			this.broadcasts.set([]);
			this.participants.set([]);
		}
	}

	close() {
		this.#signals.close();
	}
}
