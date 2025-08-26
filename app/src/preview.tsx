import * as Api from "@hang/api/client";
import { Connection, Preview } from "@kixelated/hang";
import { Path } from "@kixelated/moq";
import solid from "@kixelated/signals/solid";
import { createEffect, For, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { createStore } from "solid-js/store";

export function PreviewRoomCompact(props: {
	connection: Connection;
	path?: string;
	api: Api.Client;
	onMemberCountChange?: (count: number) => void;
}): JSX.Element {
	const room = new Preview.Room(props.connection, {
		name: props.path ? Path.from(props.path) : undefined,
		enabled: true,
	});
	onCleanup(() => room.close());

	const [members, setMembers] = createStore<{ [name: Path.Valid]: Preview.Member | undefined }>({});

	room.onMember((name, member) => {
		setMembers(name, member ?? undefined);
	});

	// Track member count changes
	createEffect(() => {
		const count = Object.values(members).filter(Boolean).length;
		props.onMemberCountChange?.(count);
	});

	const memberList = () => Object.values(members).filter(Boolean);

	// Only show if there are members
	return (
		<Show when={memberList().length > 0}>
			<div class="flex flex-wrap gap-2">
				<For each={memberList()}>
					{(member) => <Show when={member}>{(member) => <PreviewMemberCompact member={member()} />}</Show>}
				</For>
			</div>
		</Show>
	);
}

function PreviewMemberCompact(props: { member: Preview.Member }): JSX.Element {
	const info = solid(props.member.info);
	return (
		<Show when={info()}>
			{(info) => (
				<div
					class="relative flex items-center gap-2 p-2 rounded-lg flex-1 hover:scale-[1.05] transition-all duration-500"
					style={{ "flex-basis": "calc(50% - 0.25rem)", "min-width": "140px" }}
					classList={{
						"ring-1 ring-green-400/50 bg-green-500/10": info().speaking,
						"bg-gray-800/30": !info().speaking,
					}}
				>
					<div class="relative">
						<img src={info().avatar} alt={info().name} class="w-8 h-8 rounded-lg object-cover" />
						<div
							class="absolute -bottom-1 -right-1 w-4 h-4 bg-gradient-to-r from-green-400 to-green-300 rounded-full border border-gray-900 shadow-lg flex items-center justify-center transition-all duration-300"
							classList={{
								"opacity-100 scale-100": info().speaking,
								"opacity-0 scale-0": !info().speaking,
							}}
						>
							<span class="icon-[mdi--volume-high] w-2.5 h-2.5 text-gray-900" />
							<Show when={info().speaking}>
								<div class="absolute w-full h-full bg-green-400 rounded-full animate-ping opacity-75" />
							</Show>
						</div>
					</div>
					<div class="flex-1 min-w-0">
						<div class="text-xs font-medium text-white truncate">{info().name}</div>
						<div class="flex items-center gap-1">
							<Show when={info().audio}>
								<span class="icon-[mdi--microphone] w-3 h-3 text-green-400" />
							</Show>
							<Show when={info().video}>
								<span class="icon-[mdi--video] w-3 h-3 text-blue-400" />
							</Show>
							<Show when={info().chat}>
								<span class="icon-[mdi--message-text] w-3 h-3 text-purple-400" />
							</Show>
							<Show when={info().typing}>
								<span class="text-xs text-gray-400 italic">typing...</span>
							</Show>
							<Show when={info().speaking}>
								<span class="icon-[mdi--volume-high] w-3 h-3 text-green-300 animate-pulse" />
							</Show>
						</div>
					</div>
				</div>
			)}
		</Show>
	);
}

export function PreviewRoom(props: { connection: Connection; path?: string; api: Api.Client }): JSX.Element {
	const room = new Preview.Room(props.connection, {
		name: props.path ? Path.from(props.path) : undefined,
		enabled: true,
	});
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
						<p class="text-gray-500 text-sm">be the first, you trailblazer</p>
					</div>
				}
			>
				<div class="space-y-3 max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
					<For each={Object.values(members)}>
						{(member) => <Show when={member}>{(member) => <PreviewMember member={member()} />}</Show>}
					</For>
				</div>
			</Show>
		</div>
	);
}

function PreviewMember(props: { member: Preview.Member }): JSX.Element {
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
					class="group relative flex items-center gap-4 p-4 m-1 rounded-xl hover:scale-[1.05] transition-all duration-500"
					classList={{
						"ring-2 ring-green-400/50 bg-green-500/10": info().speaking,
						"bg-gradient-to-r from-gray-800/50 to-gray-800/30 hover:from-gray-700/50 hover:to-gray-700/30":
							!info().speaking,
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
						<div
							class="absolute -top-1 -right-1 w-5 h-5 bg-gradient-to-r from-green-400 to-green-300 rounded-full border-2 border-gray-900 shadow-lg flex items-center justify-center transition-all duration-300"
							classList={{
								"opacity-100 scale-100": info().speaking,
								"opacity-0 scale-0": !info().speaking,
							}}
						>
							<span class="icon-[mdi--volume-high] w-3 h-3 text-gray-900" />
							<Show when={info().speaking}>
								<div class="absolute w-full h-full bg-green-400 rounded-full animate-ping opacity-75" />
							</Show>
						</div>
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
								<span class="icon-[mdi--microphone] w-4 h-4 text-green-400" />
							</div>
							<div
								class="relative transition-all duration-300 ease-in-out"
								classList={{
									"opacity-100 scale-100": info().video,
									"opacity-0 scale-75 w-0 -ml-2": !info().video,
								}}
								title="Video enabled"
							>
								<span class="icon-[mdi--video] w-4 h-4 text-blue-400" />
							</div>
							<div
								class="relative transition-all duration-300 ease-in-out"
								classList={{
									"opacity-100 scale-100": info().chat,
									"opacity-0 scale-75 w-0 -ml-2": !info().chat,
								}}
								title="Chat active"
							>
								<span class="icon-[mdi--message-text] w-4 h-4 text-purple-400" />
							</div>
							<Show when={info().typing}>
								<div class="relative transition-all duration-300 ease-in-out" title="Typing">
									<span class="text-xs text-gray-400 italic animate-pulse">typing...</span>
								</div>
							</Show>
							<Show when={info().speaking}>
								<div
									class="relative transition-all duration-300 ease-in-out animate-pulse"
									title="Speaking"
								>
									<span class="icon-[mdi--volume-high] w-4 h-4 text-green-300" />
								</div>
							</Show>
						</div>
					</div>
				</div>
			)}
		</Show>
	);
}
