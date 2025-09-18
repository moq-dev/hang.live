import * as Moq from "@kixelated/moq";
import solid from "@kixelated/signals/solid";
import { createEffect, createSelector, createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import * as Api from "./api";
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
import * as Url from "./util/url";

import "@kixelated/hang/support/element";
import Settings from "./settings";

export function Sup(props: { canvas: Canvas; room: string }): JSX.Element {
	const connection = new Moq.Connection.Reload({ enabled: true });
	onCleanup(() => connection.close());

	// Create the local broadcasts (camera and screen)
	const local = new Local();
	onCleanup(() => local.close());

	createEffect(async () => {
		const id = Settings.account.id.peek();
		const guest = id?.startsWith("guest/") ? id : undefined;

		const response = await Api.client.routes.room[":room"].join.$post({
			param: { room: props.room },
			json: { guest },
		});
		if (!response.ok) {
			throw new Error(`Failed to join room: ${response.statusText}`);
		}

		const data = await response.json();

		connection.url.set(Url.rewrite(data.url));
		local.camera.name.set(Moq.Path.from(data.path, "camera"));
		local.share.name.set(Moq.Path.from(data.path, "screen"));
	});

	const publish = solid(local.camera.enabled);

	return (
		<Show when={publish()} fallback={<Preview room={props.room} local={local} connection={connection} />}>
			<App connection={connection} canvas={props.canvas} room={props.room} local={local} />
		</Show>
	);
}

function App(props: { connection: Moq.Connection.Reload; canvas: Canvas; room: string; local: Local }): JSX.Element {
	const room = new Room({
		canvas: props.canvas,
		name: props.room,
		local: props.local,
		connection: props.connection,
	});
	onCleanup(() => room.close());

	// Try to start the sound immediately on click.
	props.local.sound.enabled.set(true);

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
		<AppLayout connection={room.connection} room={props.room}>
			<Controls room={room} local={props.local} canvas={props.canvas} />
		</AppLayout>
	);
}

function Preview(props: { room: string; local: Local; connection: Moq.Connection.Reload }): JSX.Element {
	const status = createSelector(solid(props.connection.status));

	return (
		<WebLayout>
			<div class="font-semibold mb-6 text-center text-gray-400">ready to hang?</div>

			<hang-support class="text-2xl" prop:show="none" />

			{/* Join Button */}
			<div class="mb-12 flex justify-center">
				<button
					type="button"
					class="min-w-64 px-6 py-4 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer text-lg"
					classList={{
						"opacity-50 cursor-not-allowed": status("connected"),
					}}
					onClick={() => props.local.join.set(true)}
					style={{
						background: Gradient(),
						"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
					}}
				>
					<span class="icon-[mdi--play] inline mr-2" />
					<Switch>
						<Match when={status("connecting")}>Connecting...</Match>
						<Match when={status("disconnected")}>Disconnected</Match>
						<Match when={Api.client.authenticated()}>Join</Match>
						<Match when={!Api.client.authenticated()}>Join as Guest</Match>
					</Switch>
				</button>
			</div>

			{/* Two Column Layout */}
			<div class="flex flex-wrap gap-6 mb-8 items-start">
				{/* Left Column: Participants List */}
				<div class="flex-1 min-w-[300px] grow space-y-6">
					<PreviewRoom connection={props.connection} name={props.room} />
				</div>

				{/* Right Column: Avatar/Name Preview */}
				<div class="flex-1 min-w-[300px] grow space-y-6">
					<Show when={status("connected")} fallback={<div class="text-center text-gray-400">Loading...</div>}>
						<div class="rounded-2xl border border-gray-800 p-6">
							<PreviewIcon room={props.room} local={props.local} />
							<Show when={!Api.client.authenticated()}>
								<div class="text-center text-gray-400 mb-4">
									...or sign in to customize your profile
								</div>
								<Login />
							</Show>
						</div>
					</Show>
				</div>
			</div>
		</WebLayout>
	);
}

function PreviewIcon(props: { room: string; local: Local }): JSX.Element {
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
			<h3 class="text-xl font-semibold mb-4 underline decoration-blue-500/80 underline-offset-2">
				Your Profile <Show when={!Api.client.authenticated()}>(guest)</Show>
			</h3>

			{/* Avatar/Video Preview */}
			<div class="flex flex-col items-center mb-4 space-y-4">
				<Show when={!Api.client.authenticated()}>
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
				<Show when={Api.client.authenticated()}>
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
