import * as Api from "@hang/api-client";
import { Connection, Preview } from "@kixelated/hang";
import { Path } from "@kixelated/moq";
import solid from "@kixelated/signals/solid";
import { For, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { createStore } from "solid-js/store";
import IconShare from "~icons/mdi/share-variant";

export function PreviewRoom(props: { room: string; api: Api.Client }): JSX.Element {
	const connection = new Connection();
	onCleanup(() => connection.close());

	connection.signals.effect(async (effect) => {
		// Given the room name, fetch a cooresponding token from the API server.
		const response = await props.api.routes.room[":name"].join.$post({ param: { name: props.room } });
		if (!response.ok) {
			throw new Error(`Failed to join room: ${response.statusText}`);
		}
		const data = await response.json();

		connection.url.set(new URL(data.url));
		effect.cleanup(() => connection.url.set(undefined));
	});

	const room = new Preview.Room(connection, { enabled: true });
	onCleanup(() => room.close());

	const [members, setMembers] = createStore<{ [name: Path.Valid]: Preview.Member | undefined }>({});

	room.onMember((name, member) => {
		setMembers(name, member ?? undefined);
	});

	const shareRoom = async () => {
		const url = window.location.href;

		if (navigator.share) {
			try {
				await navigator.share({
					title: "Join my Hang room",
					text: "Come hang out with us!",
					url: url,
				});
			} catch (err) {
				// User cancelled or error
				console.log("Share cancelled or failed:", err);
			}
		} else {
			// Fallback to clipboard
			try {
				await navigator.clipboard.writeText(url);
				// Could add a toast notification here
				console.log("Room URL copied to clipboard");
			} catch (err) {
				console.error("Failed to copy URL:", err);
			}
		}
	};

	return (
		<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-xl font-semibold">Hanging Now ({Object.values(members).length})</h3>
				<button
					type="button"
					onClick={shareRoom}
					class="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-all"
					title="Share room link"
				>
					<IconShare class="w-5 h-5" />
				</button>
			</div>

			<Show
				when={Object.values(members).length > 0}
				fallback={
					<div class="text-center py-12">
						<p class="text-gray-400 mb-2">No one's here yet!</p>
						<p class="text-gray-500 text-sm">Be the first to join this room</p>
					</div>
				}
			>
				<div class="space-y-3 max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
					<For each={Object.values(members)}>
						{(member) => <Show when={member}>{(member) => <RoomMember member={member()} />}</Show>}
					</For>
				</div>
			</Show>
		</div>
	);
}

function RoomMember(props: { member: Preview.Member }): JSX.Element {
	const info = solid(props.member.info);
	return (
		<Show
			when={info()}
			fallback={
				<div class="flex items-center gap-3 p-3 rounded-xl bg-gray-800/30">
					<div class="relative">
						<div class="w-10 h-10 rounded-xl bg-gray-700 flex items-center justify-center animate-pulse">
							<div class="w-6 h-6 bg-gray-600 rounded"></div>
						</div>
					</div>
					<div class="flex-1 min-w-0">
						<div class="text-sm text-gray-400">Loading...</div>
					</div>
				</div>
			}
		>
			{(info) => (
				<div
					class="flex items-center gap-3 p-3 rounded-xl transition-all"
					classList={{
						"bg-green-500/10 border border-green-400/30": info().audio,
						"bg-gray-800/50": !info().audio,
					}}
				>
					<div class="relative">
						<div class="w-10 h-10 rounded-xl overflow-hidden bg-gray-700 flex items-center justify-center">
							<img src={info().avatar} alt={info().name} class="w-full h-full object-cover" />
						</div>
						{/* Speaking indicator */}
						<Show when={info().audio}>
							<div class="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-black animate-pulse" />
						</Show>
						<div class="flex-1 min-w-0">
							<div class="text-sm font-medium text-white truncate">{info().name}</div>
						</div>
					</div>
				</div>
			)}
		</Show>
	);
}
