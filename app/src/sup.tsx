import * as Api from "@hang/api/client";
import { Connection } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { createSignal, Match, onCleanup, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconAccountEdit from "~icons/mdi/account-edit";
import IconDice from "~icons/mdi/dice-multiple";
import IconPlay from "~icons/mdi/play";
import AnotherOne from "./components/another-one";
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

export function Sup(props: { canvas: Canvas; api: Api.Client; room: string }): JSX.Element {
	const connection = new Connection();
	onCleanup(() => connection.close());

	// Create the local broadcasts (camera and screen)
	const local = new Local(connection, props.api, props.room);
	onCleanup(() => local.close());

	const publish = solid(local.publish);

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
	const room = new Room(props.connection, props.canvas, props.local);
	onCleanup(() => room.close());

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
			<div class="max-w-7xl p-4">
				<div class="font-semibold mb-6 text-center text-gray-400">ready to hang?</div>

				{/* Join Button */}
				<div class="mb-12 flex justify-center">
					<button
						type="button"
						class="min-w-64 px-6 py-4 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer text-lg"
						classList={{
							"opacity-50 cursor-not-allowed": !info(),
						}}
						onClick={() => props.local.publish.set(true)}
						style={{
							background: Gradient(),
							"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
						}}
					>
						<IconPlay class="w-5 h-5 inline mr-2" />
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
							{(info) => (
								<div class="rounded-2xl border border-gray-800 p-6">
									<PreviewIcon api={props.api} room={props.room} local={props.local} info={info()} />
								</div>
							)}
						</Show>

						{/* Login Options - only show for guests */}
						<Show when={!props.api.authenticated()}>
							<div class="rounded-2xl border border-gray-800 p-6">
								<div class="text-center text-gray-400">...or login to customize your profile</div>
								<Login api={props.api} />
							</div>
						</Show>
					</div>
				</div>
			</div>
		</WebLayout>
	);
}

function PreviewIcon(props: { api: Api.Client; room: string; local: Local; info: Api.Account.Info }): JSX.Element {
	const [info, setInfo] = createSignal(props.info);

	const [avatarClicks, setAvatarClicks] = createSignal(0);
	const [nameClicks, setNameClicks] = createSignal(0);

	const canvas = document.createElement("canvas");
	canvas.classList.add("w-full", "h-full");

	const local = new LocalPreview(canvas, props.local.camera);
	onCleanup(() => local.close());

	const handleRandomAvatar = () => {
		setAvatarClicks((prev) => prev + 1);
		const oldAvatar = info().avatar;
		while (true) {
			const newAvatar = Api.randomAvatar();
			if (newAvatar !== oldAvatar) {
				setInfo((prev) => ({ ...prev, avatar: newAvatar }));
				break;
			}
		}
	};

	const handleRandomName = () => {
		setNameClicks((prev) => prev + 1);
		const oldName = info().name;
		while (true) {
			const newName = Api.randomName();
			if (newName !== oldName) {
				setInfo((prev) => ({ ...prev, name: newName }));
				break;
			}
		}
	};

	return (
		<>
			<h3 class="text-xl font-semibold mb-4">Your Profile</h3>

			{/* Avatar/Video Preview */}
			<div class="flex flex-col items-center mb-4">
				<div class="relative text-center">
					<div class="h-40 rounded-3xl flex items-center justify-center">{canvas}</div>
				</div>

				<Show when={!props.api.authenticated()}>
					<div class="flex gap-3 mt-4">
						<div class="relative">
							<button
								type="button"
								onClick={handleRandomAvatar}
								class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer flex items-center gap-2"
							>
								<IconDice class="w-4 h-4" />
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
								<IconDice class="w-4 h-4" />
								Name
							</button>
							<AnotherOne clicks={nameClicks} />
						</div>
					</div>
				</Show>
			</div>

			{/* Media Controls */}
			<div class="flex gap-3 justify-center mb-6">
				<Microphone audio={props.local.camera.audio} volume={false} />
				<Camera video={props.local.camera.video} />
				<Show when={props.api.authenticated()}>
					<Tooltip content="Edit your profile" position="top">
						<a
							href="/account"
							class="text-gray-400 hover:text-white transition-colors flex center hover:bg-gray-700 p-2 rounded-md"
						>
							<IconAccountEdit class="w-5 h-5" />
						</a>
					</Tooltip>
				</Show>
			</div>
		</>
	);
}

/*
function AuthenticatedPreview(props: {
	api: Api.Client;
	room: string;
	local: Local;
	info: Api.Room.JoinInfo;
}): JSX.Element {
	const canvas = document.createElement("canvas");
	canvas.classList.add("w-full", "h-full");

	const local = new LocalPreview(canvas, props.local.camera);
	onCleanup(() => local.close());

	return (
		<>
			<h3 class="text-xl font-semibold mb-4">Preview</h3>

			<div class="flex flex-col items-center mb-4">
				<div class="relative text-center">
					<div class="h-40">{canvas}</div>

					<div class="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-r-lg rounded-b-lg px-3 py-1 max-w-[calc(100%-1rem)]">
						<div
							class="text-sm font-bold truncate"
							style={{
								color: "white",
								"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
							}}
						>
							{props.info.name}
						</div>
					</div>
				</div>
			</div>
		</>
	);
}
*/

/*
function MicrophoneControl(): JSX.Element {
	const [micEnabled, setMicEnabled] = createSignal(false);
	const [hasPermission, setHasPermission] = createSignal<boolean | undefined>(undefined);

	const requestMicPermission = async () => {
		try {
			const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
			setHasPermission(true);
			setMicEnabled(true);
			// Stop the stream since we just wanted permission
			stream.getTracks().forEach((track) => track.stop());
		} catch (error) {
			setHasPermission(false);
			console.error("Microphone permission denied:", error);
		}
	};

	const toggleMic = () => {
		if (hasPermission()) {
			setMicEnabled(!micEnabled());
		} else {
			requestMicPermission();
		}
	};

	createEffect(() => {
		// Check if we already have microphone permission
		navigator.permissions?.query({ name: "microphone" as PermissionName }).then((result) => {
			setHasPermission(result.state === "granted");
			if (result.state === "granted") {
				setMicEnabled(true);
			}
		});
	});

	return (
		<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800">
			<h3 class="text-xl font-semibold mb-4">Audio Settings</h3>
			<div class="space-y-4">
				<button
					type="button"
					onClick={toggleMic}
					class="w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer"
					classList={{
						"bg-green-600 hover:bg-green-700 text-white": micEnabled() && hasPermission(),
						"bg-red-600 hover:bg-red-700 text-white": hasPermission() === false,
						"bg-gray-600 hover:bg-gray-700 text-white": hasPermission() === undefined,
					}}
				>
					<Show when={micEnabled() && hasPermission()} fallback={<IconMicrophoneOff class="w-5 h-5" />}>
						<IconMicrophone class="w-5 h-5" />
					</Show>
					<span>
						<Show
							when={hasPermission() === undefined}
							fallback={micEnabled() ? "Microphone On" : "Microphone Off"}
						>
							Enable Microphone
						</Show>
					</span>
				</button>
				<p class="text-sm text-gray-400 text-center">
					<Show when={hasPermission() === false} fallback="Click to enable your microphone before joining.">
						Microphone access was denied. Please allow microphone access in your browser settings.
					</Show>
				</p>
			</div>
		</div>
	);
}
*/
