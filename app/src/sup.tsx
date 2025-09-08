import * as Api from "@hang/api/client";
import { Connection } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { createEffect, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import AnotherOne from "./components/another-one";
import { Badge } from "./components/badge";
import Gradient from "./components/gradient";
import Login from "./components/login";
import Tooltip from "./components/tooltip";
import { Camera, Controls, Microphone } from "./controls";
import AppLayout from "./layout/app";
import WebLayout from "./layout/web";
import { PreviewRoom } from "./preview";
import { Room } from "./room";
import { Canvas } from "./room/canvas";
import { Local, LocalPreview } from "./room/local";

import "@kixelated/hang/support/element";

export function Sup(props: { canvas: Canvas; api: Api.Client; room: string }): JSX.Element {
	const connection = new Connection();
	onCleanup(() => connection.close());

	// Create the local broadcasts (camera and screen)
	const local = new Local(connection, props.api, props.room);
	onCleanup(() => local.close());

	const publish = solid(local.camera.enabled);

	return (
		<Show
			when={publish()}
			fallback={<Preview connection={connection} api={props.api} room={props.room} local={local} />}
		>
			<App connection={connection} canvas={props.canvas} api={props.api} room={props.room} local={local} />
		</Show>
	);
}

function App(props: {
	connection: Connection;
	canvas: Canvas;
	room: string;
	api: Api.Client;
	local: Local;
}): JSX.Element {
	// Try to start the sound immediately on click.
	props.local.sound.enabled.set(true);

	const room = new Room(props.connection, props.canvas, props.local);
	onCleanup(() => room.close());

	// Update badge count based on room participants
	const participantCount = solid(room.space.ordered);
	const badge = new Badge();

	// Watch for participant changes and update badge
	createEffect(() => {
		const count = Math.max((participantCount()?.length || 0) - 1, 0);
		badge.set(count);
	});

	// Clear badge when leaving the room
	onCleanup(() => badge.close());

	return (
		<AppLayout connection={room.connection} api={props.api} room={props.room}>
			<Controls room={room} local={props.local} canvas={props.canvas} />
		</AppLayout>
	);
}

function Preview(props: { connection: Connection; api: Api.Client; room: string; local: Local }): JSX.Element {
	const info = solid(props.local.info);

	return (
		<WebLayout>
			<div class="font-semibold mb-6 text-center text-gray-400">ready to hang?</div>

			<hang-support class="text-2xl" prop:show="partial" />

			{/* Join Button */}
			<div class="mb-12 flex justify-center">
				<button
					type="button"
					class="min-w-64 px-6 py-4 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer text-lg"
					classList={{
						"opacity-50 cursor-not-allowed": !info(),
					}}
					onClick={() => props.local.camera.enabled.set(true)}
					style={{
						background: Gradient(),
						"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
					}}
				>
					<span class="icon-[mdi--play] inline mr-2" />
					<Switch>
						<Match when={!info()}>Loading...</Match>
						<Match when={props.api.authenticated()}>Join</Match>
						<Match when={!props.api.authenticated()}>Join as Guest</Match>
					</Switch>
				</button>
			</div>

			{/* Two Column Layout */}
			<div class="flex flex-wrap gap-6 mb-8 items-start">
				{/* Left Column: Participants List */}
				<div class="flex-1 min-w-[300px] grow space-y-6">
					<PreviewRoom connection={props.connection} api={props.api} />
				</div>

				{/* Right Column: Avatar/Name Preview */}
				<div class="flex-1 min-w-[300px] grow space-y-6">
					<Show when={info()} fallback={<div class="text-center text-gray-400">Loading...</div>}>
						<div class="rounded-2xl border border-gray-800 p-6">
							<PreviewIcon api={props.api} room={props.room} local={props.local} />
						</div>
					</Show>

					{/* Login Options - only show for guests */}
					<Show when={!props.api.authenticated()}>
						<div class="rounded-2xl border border-gray-800 p-6">
							<div class="text-center text-gray-400 mb-4">...or login to customize your profile</div>
							<Login api={props.api} />
						</div>
					</Show>
				</div>
			</div>
		</WebLayout>
	);
}

function PreviewIcon(props: { api: Api.Client; room: string; local: Local }): JSX.Element {
	const info = solid(props.local.info);

	const [avatarClicks, setAvatarClicks] = createSignal(0);
	const [nameClicks, setNameClicks] = createSignal(0);

	const canvas = document.createElement("canvas");
	canvas.classList.add("w-full", "h-full");

	const local = new LocalPreview(canvas, props.local.camera);
	onCleanup(() => local.close());

	const handleRandomAvatar = () => {
		const i = info();
		if (!i) return; // not possible, just for typescript

		setAvatarClicks((prev) => prev + 1);
		while (true) {
			const newAvatar = Api.randomAvatar();
			if (newAvatar !== i.avatar) {
				props.local.info.set({ ...i, avatar: newAvatar });
				break;
			}
		}
	};

	const handleRandomName = () => {
		setNameClicks((prev) => prev + 1);
		const i = info();
		if (!i) return; // not possible, just for typescript

		while (true) {
			const newName = Api.randomName();
			if (newName !== i.name) {
				props.local.info.set({ ...i, name: newName });
				break;
			}
		}
	};

	return (
		<>
			<h3 class="text-xl font-semibold mb-4">
				Your Profile <Show when={!props.api.authenticated()}>(guest)</Show>
			</h3>

			{/* Avatar/Video Preview */}
			<div class="flex flex-col items-center mb-4 space-y-4">
				<Show when={!props.api.authenticated()}>
					<div class="flex gap-3">
						<div class="relative">
							<button
								type="button"
								onClick={handleRandomAvatar}
								class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer flex items-center gap-2"
							>
								<span class="icon-[mdi--dice-multiple] w-4 h-4" />
								Avatar
							</button>
							<AnotherOne clicks={avatarClicks} />
						</div>

						<div class="relative">
							<button
								type="button"
								onClick={handleRandomName}
								class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer flex items-center gap-2"
							>
								<span class="icon-[mdi--dice-multiple] w-4 h-4" />
								Name
							</button>
							<AnotherOne clicks={nameClicks} />
						</div>
					</div>
				</Show>

				<div class="relative text-center">
					<div class="h-48 rounded-3xl flex items-center justify-center">{canvas}</div>
				</div>
			</div>

			{/* Media Controls */}
			<div class="flex gap-3 justify-center mb-6">
				<Microphone local={props.local} />
				<Camera local={props.local} />
				<Show when={props.api.authenticated()}>
					<Tooltip content="Edit your profile" position="top">
						<a
							href="/account"
							class="text-gray-400 hover:text-white transition-colors flex center hover:bg-gray-700 p-2 rounded-md"
						>
							<span class="icon-[mdi--account-edit]" />
						</a>
					</Tooltip>
				</Show>
			</div>
		</>
	);
}
