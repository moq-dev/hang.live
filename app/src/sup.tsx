import * as Api from "@hang/api/client";
import { createEffect, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { adjectives, animals, uniqueNamesGenerator } from "unique-names-generator";
import IconAccountEdit from "~icons/mdi/account-edit";
import IconCamera from "~icons/mdi/camera";
import IconDice from "~icons/mdi/dice-multiple";
import IconPlay from "~icons/mdi/play";
import { Canvas } from "./canvas";
import { Chat } from "./chat";
import AnotherOne from "./components/another-one";
import Gradient from "./components/gradient";
import Login from "./components/login";
import { Controls } from "./controls";
import AppLayout from "./layout/app";
import WebLayout from "./layout/web";
import { PreviewRoom } from "./preview";
import { Room } from "./room";

interface Info {
	name: string;
	avatar: string;
	guest: boolean;
}

function randomName(): string {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: " ",
		style: "capital",
	});
}

export function Sup(props: { canvas: Canvas; api: Api.Client; room: string }): JSX.Element {
	const [info, setInfo] = createSignal<Info | undefined>(undefined);

	return (
		<Show when={info()} fallback={<Preview api={props.api} room={props.room} join={setInfo} />}>
			{(info) => <App canvas={props.canvas} api={props.api} room={props.room} info={info()} />}
		</Show>
	);
}

function App(props: { canvas: Canvas; room: string; api: Api.Client; info: Info }): JSX.Element {
	const room = new Room(props.canvas, props.api, {
		name: props.room,
		user: props.info.name,
		avatar: props.info.avatar,
	});

	onCleanup(() => room.close());

	return (
		<AppLayout connection={room.connection} api={props.api}>
			<Chat canvas={props.canvas} room={room} />
			<Controls room={room} camera={room.camera} screen={room.screen} canvas={props.canvas} />
		</AppLayout>
	);
}

function Preview(props: { api: Api.Client; room: string; join: (info: Info) => void }): JSX.Element {
	const [info, setInfo] = createSignal<Info | undefined>(undefined);

	const join = () => {
		const i = info();
		if (i) props.join(i);
	};

	return (
		<WebLayout api={props.api}>
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
						onClick={join}
						style={{
							background: Gradient(),
							"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
						}}
					>
						<IconPlay class="w-5 h-5 inline mr-2" />
						<Switch>
							<Match when={!info()}>Loading...</Match>
							<Match when={info()?.guest}>Join as Guest</Match>
							<Match when={!info()?.guest}>Join</Match>
						</Switch>
					</button>
				</div>

				{/* Two Column Layout */}
				<div class="flex flex-wrap gap-6 mb-8 items-start">
					{/* Left Column: Participants List */}
					<div class="flex-1 min-w-[300px] grow space-y-6">
						<PreviewRoom room={props.room} api={props.api} />
					</div>

					{/* Right Column: Avatar/Name Preview */}
					<div class="flex-1 min-w-[300px] grow space-y-6">
						<Show
							when={props.api.authenticated()}
							fallback={
								<div class="rounded-2xl border border-gray-800 p-6">
									<AnonymousPreview api={props.api} room={props.room} setInfo={setInfo} />
								</div>
							}
						>
							<div class="rounded-2xl border border-gray-800 p-6">
								<AuthenticatedPreview api={props.api} room={props.room} setInfo={setInfo} />
							</div>
						</Show>

						{/* Login Options - only show for guests */}
						<Show when={!props.api.authenticated()}>
							<div class="rounded-2xl border border-gray-800 p-6">
								<div class="text-center text-gray-400">...or login to customize your profile</div>
								<Login api={props.api} />
							</div>
						</Show>

						{/* <MicrophoneControl /> */}
					</div>
				</div>
			</div>
		</WebLayout>
	);
}

function AnonymousPreview(props: { api: Api.Client; room: string; setInfo: (info: Info) => void }): JSX.Element {
	const [avatar, setAvatar] = createSignal(Api.randomAvatar());
	const [name, setName] = createSignal(randomName());
	const [avatarClicks, setAvatarClicks] = createSignal(0);
	const [nameClicks, setNameClicks] = createSignal(0);

	createEffect(() => {
		props.setInfo({ name: name(), avatar: avatar(), guest: true });
	});

	const handleRandomAvatar = () => {
		setAvatarClicks((prev) => prev + 1);
		const oldAvatar = avatar();
		while (true) {
			const newAvatar = Api.randomAvatar();
			if (newAvatar !== oldAvatar) {
				setAvatar(newAvatar);
				break;
			}
		}
	};

	const handleRandomName = () => {
		setNameClicks((prev) => prev + 1);
		const oldName = name();
		while (true) {
			const newName = randomName();
			if (newName !== oldName) {
				setName(newName);
				break;
			}
		}
	};

	return (
		<>
			<h3 class="text-xl font-semibold mb-4">Guest Profile</h3>

			{/* Avatar Preview */}
			<div class="flex flex-col items-center mb-12">
				<div class="relative text-center">
					<div class="w-40 h-40 rounded-3xl overflow-hidden bg-gray-800 flex items-center justify-center border-8 border-black shadow-xl">
						<img src={avatar()} alt="Avatar Preview" class="w-full h-full object-cover" />
					</div>

					{/* Display Name Overlay */}
					<div class="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-r-lg rounded-b-lg px-3 py-1 max-w-[calc(100%-1rem)]">
						<div
							class="text-sm font-bold truncate"
							style={{
								color: "white",
								"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
							}}
						>
							{name()}
						</div>
					</div>
				</div>

				{/* Random Buttons */}
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
			</div>
		</>
	);
}

function AuthenticatedPreview(props: { api: Api.Client; room: string; setInfo: (info: Info) => void }): JSX.Element {
	const [info, setInfo] = createSignal<Api.Account.Info | undefined>(undefined);
	const [error, setError] = createSignal<string | undefined>(undefined);

	createEffect(() => {
		const i = info();
		if (i) props.setInfo({ name: i.name, avatar: i.avatar, guest: false });
	});

	onMount(async () => {
		try {
			const response = await props.api.routes.account.info.$get();
			if (response.ok) {
				setInfo(await response.json());
			} else {
				setError(response.statusText);
			}
		} catch (e) {
			setError(`Failed to load account info: ${e}`);
		}
	});

	return (
		<Switch>
			<Match when={error()}>
				<div class="bg-red-500/20 border border-red-400/30 rounded-2xl p-4 mb-6 text-red-300 text-center">
					Error: {error()}
				</div>
			</Match>
			<Match when={info()}>
				{(userInfo) => (
					<>
						<h3 class="text-xl font-semibold mb-4">Your Profile</h3>

						{/* Avatar Preview */}
						<div class="flex flex-col items-center mb-4">
							<div class="relative text-center">
								<div class="w-40 h-40 rounded-3xl overflow-hidden bg-gray-800 flex items-center justify-center border-8 border-black shadow-xl">
									<Show
										when={userInfo().avatar}
										fallback={<IconCamera class="w-8 h-8 text-gray-400" />}
									>
										<img
											src={userInfo().avatar}
											alt="Avatar Preview"
											class="w-full h-full object-cover"
										/>
									</Show>
								</div>

								{/* Display Name Overlay */}
								<div class="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-r-lg rounded-b-lg px-3 py-1 max-w-[calc(100%-1rem)]">
									<div
										class="text-sm font-bold truncate"
										style={{
											color: "white",
											"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
										}}
									>
										{userInfo().name}
									</div>
								</div>
							</div>
						</div>

						{/* Account Link */}
						<div class="text-center">
							<a
								href="/account"
								class="text-gray-400 hover:text-white transition-colors flex items-center gap-2 justify-center"
							>
								<IconAccountEdit class="w-5 h-5" />
								Edit
							</a>
						</div>
					</>
				)}
			</Match>
			<Match when={true}>
				<div class="text-center text-gray-400">Loading...</div>
			</Match>
		</Switch>
	);
}

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
