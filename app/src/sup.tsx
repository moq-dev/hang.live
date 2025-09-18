import * as Moq from "@kixelated/moq";
import solid from "@kixelated/signals/solid";
import { createEffect, createSelector, Match, onCleanup, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import * as Api from "./api";
import { Badge } from "./components/badge";
import Gradient from "./components/gradient";
import Login from "./components/login";
import Profile from "./components/profile";
import { Controls } from "./controls";
import AppLayout from "./layout/app";
import WebLayout from "./layout/web";
import { PreviewRoom } from "./preview";
import { Room } from "./room";
import { Canvas } from "./room/canvas";
import { Local } from "./room/local";
import * as Url from "./util/url";

import "@kixelated/hang/support/element";
import Settings from "./settings";

export function Sup(props: { canvas: Canvas; room: string }): JSX.Element {
	const connection = new Moq.Connection.Reload({ enabled: true });
	onCleanup(() => connection.close());

	// Create the local broadcasts (camera and screen)
	const local = new Local({ connection: connection.established });
	onCleanup(() => local.close());

	createEffect(async () => {
		const guest = !Api.client.authenticated() ? Settings.account.guest.peek() : undefined;

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

		// Save the guest account settings
		Settings.account.guest.set(data.guest);
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
		// name: props.room,
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
						"opacity-50 cursor-not-allowed": !status("connected"),
					}}
					onClick={() => Local.join.set(true)}
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
					<PreviewRoom connection={props.connection} />
				</div>

				{/* Right Column: Avatar/Name Preview */}
				<div class="flex-1 min-w-[300px] grow space-y-6">
					<Show when={status("connected")} fallback={<div class="text-center text-gray-400">Loading...</div>}>
						<div class="rounded-2xl border border-gray-800 p-6">
							<Profile local={props.local} />
							<Show when={!Api.client.authenticated()}>
								<div class="text-center text-gray-400 my-4">
									...or sign in to customize your profile
								</div>
								<Login small />
							</Show>
						</div>
					</Show>
				</div>
			</div>
		</WebLayout>
	);
}
