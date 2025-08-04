import * as Api from "@hang/api/client";
import { Connection, Preview } from "@kixelated/hang";
import { Path } from "@kixelated/moq";
import solid from "@kixelated/signals/solid";
import { For, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { createStore } from "solid-js/store";
import IconChat from "~icons/mdi/message-text";
import IconMicrophone from "~icons/mdi/microphone";
import IconVideo from "~icons/mdi/video";
import IconVolumeHigh from "~icons/mdi/volume-high";

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

	return (
		<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800">
			<div class="mb-4">
				<h3 class="text-xl font-semibold">Hanging Now ({Object.values(members).length})</h3>
			</div>

			<Show
				when={Object.values(members).length > 0}
				fallback={
					<div class="text-center py-12">
						<h3 class="text-lg font-semibold mb-4">No one's here yet!</h3>
						<p class="text-gray-500 text-sm">Be the first to join</p>
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
				<div class="flex items-center gap-4 p-4 rounded-xl bg-gray-800/30 backdrop-blur-sm">
					<div class="relative">
						<div class="w-12 h-12 rounded-xl bg-gradient-to-br from-gray-600 to-gray-700 flex items-center justify-center animate-pulse shadow-lg">
							<div class="w-7 h-7 bg-gray-500 rounded-lg" />
						</div>
					</div>
					<div class="flex-1 min-w-0">
						<div class="h-4 bg-gray-600 rounded animate-pulse mb-1" />
						<div class="h-3 bg-gray-700 rounded animate-pulse w-2/3" />
					</div>
				</div>
			}
		>
			{(info) => (
				<div
					class="group relative flex items-center gap-4 p-4 m-1 rounded-xl transition-all duration-300 hover:scale-[1.02] cursor-pointer"
					classList={{
						"bg-gradient-to-r from-green-500/10 via-green-500/5 to-transparent border border-green-400/20 shadow-lg shadow-green-500/5":
							info().audio || info().video || info().chat,
						"bg-gradient-to-r from-gray-800/50 to-gray-800/30 hover:from-gray-700/50 hover:to-gray-700/30":
							!info().audio && !info().video && !info().chat,
					}}
				>
					<div class="relative z-10">
						<div
							class="w-12 h-12 rounded-xl overflow-hidden bg-gray-700 transition-all duration-300 shadow-lg"
							classList={{
								"ring-2 ring-blue-400/50": info().video,
								"ring-2 ring-gray-600 group-hover:ring-gray-500": !info().video,
							}}
						>
							<img
								src={info().avatar}
								alt={info().name}
								class="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
							/>
						</div>
						<Show when={info().speaking}>
							<div class="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-green-400 to-green-300 rounded-full border-2 border-gray-900 shadow-lg flex items-center justify-center">
								<IconVolumeHigh class="w-3 h-3 text-gray-900" />
								<div class="absolute w-full h-full bg-green-400 rounded-full animate-ping opacity-75" />
							</div>
						</Show>
					</div>
					<div class="flex-1 min-w-0 relative z-10">
						<div class="text-base font-semibold text-white truncate group-hover:text-green-100 transition-colors mb-1">
							{info().name}
						</div>
						<div class="flex items-center gap-2">
							<div
								class="relative transition-all duration-300 ease-in-out"
								classList={{
									"opacity-100 scale-100": info().audio,
									"opacity-0 scale-75 w-0 -ml-2": !info().audio,
								}}
								title="Voice enabled"
							>
								<IconMicrophone class="w-4 h-4 text-green-400" />
							</div>
							<div
								class="relative transition-all duration-300 ease-in-out"
								classList={{
									"opacity-100 scale-100": info().video,
									"opacity-0 scale-75 w-0 -ml-2": !info().video,
								}}
								title="Video enabled"
							>
								<IconVideo class="w-4 h-4 text-blue-400" />
							</div>
							<div
								class="relative transition-all duration-300 ease-in-out"
								classList={{
									"opacity-100 scale-100": info().chat,
									"opacity-0 scale-75 w-0 -ml-2": !info().chat,
								}}
								title="Chat active"
							>
								<IconChat class="w-4 h-4 text-purple-400" />
							</div>
							<Show when={info().speaking}>
								<div
									class="relative transition-all duration-300 ease-in-out animate-pulse"
									title="Speaking"
								>
									<IconVolumeHigh class="w-4 h-4 text-green-300" />
								</div>
							</Show>
						</div>
					</div>
				</div>
			)}
		</Show>
	);
}
