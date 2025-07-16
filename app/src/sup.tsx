import * as Api from "@hang/api-client";
import { createEffect, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconCamera from "~icons/mdi/camera";
import IconDice from "~icons/mdi/dice-multiple";
import IconDiscord from "~icons/mdi/discord";
import IconGoogle from "~icons/mdi/google";
import IconMicrophone from "~icons/mdi/microphone";
import IconMicrophoneOff from "~icons/mdi/microphone-off";
import IconVideo from "~icons/mdi/video";
import { AnotherOne } from "./another-one";
import { Canvas } from "./canvas";
import { Chat } from "./chat";
import { Controls } from "./controls";
import { useAnimatedGradient } from "./gradient";
import { Layout } from "./layout";
import { Room } from "./room";
import { unreachable } from "./util";

// Random name generator for anonymous users
const RANDOM_NAMES = [
	"Anonymous",
	"Mystery Person",
	"Unknown User",
	"Secret Agent",
	"Phantom",
	"Shadow",
	"Ninja",
	"Ghost",
	"Stranger",
	"Wanderer",
	"Explorer",
	"Visitor",
	"Guest",
	"Traveler",
	"Nomad",
];

interface Info {
	name: string;
	avatar: string;
	guest: boolean;
}

function randomName(): string {
	return RANDOM_NAMES[Math.floor(Math.random() * RANDOM_NAMES.length)];
}

interface Participant {
	id: string;
	name: string;
	avatar: string;
	speaking: boolean;
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
	const url = new URL(`${import.meta.env.VITE_RELAY_URL}/hang/${props.room}/`);

	const room = new Room(url, props.canvas, { user: props.info.name, avatar: props.info.avatar });
	onCleanup(() => room.close());

	/*
	if (props.api.authenticated()) {
		props.api.routes.account.info
			.$get()
			.then(async (info) => {
				if (!info.ok) throw new Error(info.statusText);
				return await info.json();
			})
			.then((info) => {
				// Only set the user name from account if not already set from URL
				room.user.set(info.name);
				room.avatar.set(info.avatar);
			});
	}
	*/

	return (
		<Layout full={true} connection={room.connection}>
			<Chat canvas={props.canvas} room={room} />
			<Controls room={room} camera={room.camera} screen={room.screen} canvas={props.canvas} />
		</Layout>
	);
}

function Preview(props: { api: Api.Client; room: string; join: (info: Info) => void }): JSX.Element {
	const gradient = useAnimatedGradient();

	const [info, setInfo] = createSignal<Info | undefined>(undefined);

	const join = () => {
		const i = info();
		if (i) props.join(i);
	};

	return (
		<Layout full={false}>
			<div class="max-w-7xl mx-auto p-4">
				<div class="font-semibold mb-4 text-center text-gray-400">ready to hang?</div>

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
							background: gradient.linear(),
							"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
						}}
					>
						<IconVideo class="w-5 h-5 inline mr-2" />
						<Switch>
							<Match when={!info()}>Loading...</Match>
							<Match when={info()?.guest}>Join as Guest</Match>
							<Match when={!info()?.guest}>Join</Match>
						</Switch>
					</button>
				</div>

				{/* Two Column Layout */}
				<div class="flex flex-wrap gap-6 mb-8 items-start">
					{/* Left Column: Avatar/Name Preview */}
					<div class="flex-1 min-w-[300px] grow bg-gray-900/30 rounded-2xl border border-gray-800 p-6">
						<Show
							when={props.api.authenticated()}
							fallback={<AnonymousPreview api={props.api} room={props.room} setInfo={setInfo} />}
						>
							<AuthenticatedPreview api={props.api} room={props.room} setInfo={setInfo} />
						</Show>
					</div>

					{/* Right Column: Participants List */}
					<div class="flex-1 min-w-[300px] grow space-y-6">
						<ParticipantsList />
						<MicrophoneControl />
					</div>
				</div>
			</div>
		</Layout>
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

	const getProviderIcon = (provider: Api.OAuth.ProviderId) => {
		switch (provider) {
			case "google":
				return <IconGoogle class="w-5 h-5" />;
			case "discord":
				return <IconDiscord class="w-5 h-5" />;
			default:
				unreachable(provider);
		}
	};

	const getProviderColor = (provider: Api.OAuth.ProviderId) => {
		switch (provider) {
			case "google":
				return "bg-red-600 hover:bg-red-700";
			case "discord":
				return "bg-blue-600 hover:bg-blue-700";
			default:
				unreachable(provider);
		}
	};

	const handleProviderLogin = (provider: Api.OAuth.ProviderId) => {
		props.api.login(provider);
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

			{/* Login Options */}
			<div class="text-center">
				<p class="text-gray-400 m-4">or login to customize your profile</p>
				<div class="space-y-3">
					<For each={Api.oauthProviders}>
						{(provider) => (
							<button
								type="button"
								onClick={() => handleProviderLogin(provider)}
								class="w-full flex items-center justify-center gap-3 px-4 py-3 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer"
								classList={{
									[getProviderColor(provider)]: true,
								}}
							>
								<div style={{ filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.8))" }}>
									{getProviderIcon(provider)}
								</div>
								<span class="capitalize">Login with {provider}</span>
							</button>
						)}
					</For>
				</div>
			</div>
		</>
	);
}

function AuthenticatedPreview(props: { api: Api.Client; room: string; setInfo: (info: Info) => void }): JSX.Element {
	const [info, setInfo] = createSignal<Api.Account.Info | undefined>(undefined);
	const [error, setError] = createSignal<string | undefined>(undefined);

	const gradient = useAnimatedGradient();

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
						<div class="flex flex-col items-center mb-8">
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
							<a href="/account" class="text-gray-400 hover:text-white transition-colors text-sm">
								Edit profile →
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

function ParticipantsList(): JSX.Element {
	// TODO: This will be replaced with actual participant data
	const [participants] = createSignal<Participant[]>([
		{ id: "1", name: "You", avatar: "/avatar/1.svg", speaking: false },
		{ id: "2", name: "Alice Johnson", avatar: "/avatar/15.svg", speaking: true },
		{ id: "3", name: "Bob Smith", avatar: "/avatar/23.svg", speaking: false },
		{ id: "4", name: "Charlie Brown", avatar: "/avatar/7.svg", speaking: false },
		{ id: "5", name: "Diana Prince", avatar: "/avatar/12.svg", speaking: true },
		{ id: "6", name: "Eve Wilson", avatar: "/avatar/18.svg", speaking: false },
		{ id: "7", name: "Frank Miller", avatar: "/avatar/25.svg", speaking: false },
		{ id: "8", name: "Grace Lee", avatar: "/avatar/33.svg", speaking: true },
		{ id: "9", name: "Henry Davis", avatar: "/avatar/8.svg", speaking: false },
		{ id: "10", name: "Iris Chen", avatar: "/avatar/19.svg", speaking: false },
		{ id: "11", name: "Jack Thompson", avatar: "/avatar/27.svg", speaking: false },
		{ id: "12", name: "Kate Rodriguez", avatar: "/avatar/14.svg", speaking: true },
		{ id: "13", name: "Liam O'Connor", avatar: "/avatar/31.svg", speaking: false },
		{ id: "14", name: "Maya Patel", avatar: "/avatar/6.svg", speaking: false },
	]);

	return (
		<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800">
			<h3 class="text-xl font-semibold mb-4">Active ({participants().length})</h3>
			<div class="space-y-3 max-h-80 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800 hover:scrollbar-thumb-gray-500">
				<For each={participants()}>
					{(participant) => (
						<div
							class="flex items-center gap-3 p-3 rounded-xl transition-all"
							classList={{
								"bg-green-500/10 border border-green-400/30": participant.speaking,
								"bg-gray-800/50": !participant.speaking,
							}}
						>
							<div class="relative">
								<div class="w-10 h-10 rounded-xl overflow-hidden bg-gray-700 flex items-center justify-center">
									<img
										src={participant.avatar}
										alt={participant.name}
										class="w-full h-full object-cover"
									/>
								</div>
								{/* Speaking indicator */}
								<Show when={participant.speaking}>
									<div class="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-black animate-pulse" />
								</Show>
							</div>
							<div class="flex-1 min-w-0">
								<div class="text-sm font-medium text-white truncate">{participant.name}</div>
							</div>
						</div>
					)}
				</For>
			</div>
		</div>
	);
}

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
