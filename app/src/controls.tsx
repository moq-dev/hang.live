import type { Publish } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import {
	type Accessor,
	createEffect,
	createMemo,
	createSelector,
	createSignal,
	Match,
	onCleanup,
	onMount,
	Show,
	Switch,
} from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { MemeSelector } from "./components/meme-selector";
import Tooltip from "./components/tooltip";
import type { Room } from "./room";
import type { Canvas } from "./room/canvas";
import { Local } from "./room/local";
import { Sound } from "./room/sound";
import Settings, { Modal } from "./settings";

export function Controls(props: { room: Room; local: Local; canvas: Canvas }): JSX.Element {
	return (
		<div
			class="fixed bottom-0 left-0 right-0 flex items-end gap-4 p-4 text-shadow-lg text-xl pointer-events-none z-[10] leading-none"
			role="toolbar"
			aria-label="Media controls"
		>
			{/* Left group */}
			<div class="flex gap-4 items-end">
				<Microphone local={props.local} />
				<Camera local={props.local} room={props.room} />
				<Screen local={props.local} room={props.room} />
			</div>

			{/* Center group */}
			<div class="flex-1 flex justify-center">
				<Chat broadcast={props.local.camera} room={props.room} />
			</div>

			{/* Right group */}
			<div class="flex items-end gap-4">
				<Volume room={props.room} />
				{/* <ClosedCaptions /> */}
				<Advanced sound={props.room.space.sound} />
				<Fullscreen canvas={props.canvas} />
			</div>
		</div>
	);
}

export function Microphone(props: { local: Local }): JSX.Element {
	const toggle = () => {
		props.local.microphone.enabled.set((prev: boolean) => !prev);
	};
	const root = solid(props.local.camera.audio.root);

	const [showMenu, setShowMenu] = createSignal(false);
	const [deviceChangeIndicator, setDeviceChangeIndicator] = createSignal(false);
	const [deviceChangeMessage, setDeviceChangeMessage] = createSignal("");
	const volume = solid(Settings.microphone.gain);

	// Use device signals from the Device API
	const device = props.local.microphone.device;
	const enabled = solid(props.local.microphone.enabled);
	const available = solid(device.available);
	const requested = createSelector(solid(device.requested));
	const active = createSelector(solid(device.active));

	// Watch for device changes and trigger indicator
	let previousDeviceCount = available()?.length ?? 0;
	createEffect(() => {
		const currentDevices = available();
		const currentCount = currentDevices?.length ?? 0;
		if (currentCount !== previousDeviceCount && previousDeviceCount !== 0) {
			setDeviceChangeIndicator(true);
			if (currentCount > previousDeviceCount) {
				setDeviceChangeMessage("New microphone detected");
			} else {
				setDeviceChangeMessage("Microphone disconnected");
			}
			setTimeout(() => {
				setDeviceChangeIndicator(false);
				setDeviceChangeMessage("");
			}, 5000);
		}
		previousDeviceCount = currentCount;
	});

	// Close menu when clicking outside
	let menuRef: HTMLDivElement | undefined;
	let buttonRef: HTMLButtonElement | undefined;

	onMount(() => {
		const handleClick = (e: MouseEvent) => {
			if (
				showMenu() &&
				menuRef &&
				buttonRef &&
				!menuRef.contains(e.target as Node) &&
				!buttonRef.contains(e.target as Node)
			) {
				setShowMenu(false);
			}
		};
		document.addEventListener("click", handleClick);
		onCleanup(() => document.removeEventListener("click", handleClick));
	});

	// Request permissions
	const requestPermissions = () => {
		device.requestPermission();
	};

	// Handle device selection
	const selectDevice = (deviceId: string) => {
		if (root() && (deviceId === device.active.peek() || deviceId === device.requested.peek())) {
			// Same device selected and mic is enabled - disable it
			props.local.microphone.enabled.set(false);
			device.preferred.set(undefined);
		} else {
			// Different device or mic is disabled - enable it
			device.preferred.set(deviceId);
			props.local.microphone.enabled.set(true);
		}
	};

	return (
		<div class="flex items-start pointer-events-auto relative">
			<Tooltip content={root() ? "Disable microphone" : "Enable microphone"} position="top">
				<button
					type="button"
					onClick={toggle}
					class="relative border hover:bg-gray-700 transition-all cursor-pointer p-2 backdrop-blur-sm bg-transparent rounded"
					role="switch"
					aria-checked={!!root()}
					aria-label="Toggle microphone"
					classList={{
						"border-white": !!root(),
						"border-transparent": !root(),
						"text-red-500": root() && volume() === 0,
					}}
				>
					<Visualize audio={props.local.camera.audio} />
					<span class={root() ? "icon-[mdi--microphone]" : "icon-[mdi--microphone-off]"} />
				</button>
			</Tooltip>
			<Show when={root()}>
				<Tooltip
					content={deviceChangeMessage() || "Microphone settings"}
					position="top"
					force={deviceChangeIndicator()}
				>
					<button
						ref={buttonRef}
						type="button"
						onClick={() => setShowMenu(!showMenu())}
						class="text-xs hover:bg-white/10 transition-all cursor-pointer p-1 backdrop-blur-sm bg-transparent rounded mt-1"
						aria-label="Microphone settings"
						aria-expanded={showMenu()}
						classList={{
							"animate-pulse": deviceChangeIndicator(),
						}}
					>
						<span class={showMenu() ? "icon-[mdi--chevron-up]" : "icon-[mdi--chevron-down]"} />
					</button>
				</Tooltip>
			</Show>
			<Show when={enabled() && showMenu()}>
				<div
					ref={menuRef}
					class="absolute bottom-full mb-2 left-0 min-w-80 max-w-[calc(100vw-2rem)] bg-black/90 backdrop-blur-lg rounded-lg border border-white/30 shadow-2xl p-4 z-50 flex flex-col gap-4"
				>
					{/* Title */}
					<h3 class="text-white font-semibold mb-1 text-2xl underline decoration-link-hue underline-offset-2">
						Microphone Settings
					</h3>

					{/* Volume slider */}
					<div class="flex items-center gap-2 flex-grow">
						<span class="icon-[mdi--volume-low] text-white/80 text-sm" />
						<div class="flex-1 relative flex items-center">
							<input
								type="range"
								min="0"
								step="0.01"
								max="2"
								value={volume()}
								onInput={(e) => Settings.microphone.gain.set(Number(e.currentTarget.value))}
								class="w-full cursor-pointer h-1 bg-white/20 rounded-full appearance-none relative z-10 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:relative [&::-webkit-slider-thumb]:z-20"
								aria-label="Microphone volume"
								style={{
									background: `linear-gradient(to right, hsl(var(--link-hue) 60% 60%) 0%, hsl(var(--link-hue) 60% 60%) ${volume() * 50}%, rgba(255, 255, 255, 0.2) ${volume() * 50}%, rgba(255, 255, 255, 0.2) 100%)`,
									height: "4px",
								}}
							/>
						</div>
						<span class="icon-[mdi--volume-high] text-white/88 text-sm" />
						<span class="text-xs text-white/80 min-w-[2.5rem] text-right">
							{Math.round(volume() * 100)}%
						</span>
					</div>

					{/* Divider */}
					<div class="h-px bg-white/10" />

					{/* Device selection */}
					<div class="flex flex-col gap-1 w-full">
						<Switch>
							<Match when={available() === undefined}>
								<button
									type="button"
									onClick={requestPermissions}
									class="flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
								>
									<span class="icon-[mdi--shield-check] text-base" />
									<span>Grant Microphone Permission</span>
								</button>
							</Match>
							<Match when={available()?.length === 0}>
								<div class="text-sm text-white/40 px-3 py-2">No devices found</div>
							</Match>
							<Match when={available()}>
								{(devices) => (
									<>
										{devices().map((dev) => (
											<button
												type="button"
												onClick={() => selectDevice(dev.deviceId)}
												class="flex items-center gap-2 text-left text-sm px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
												classList={{
													"bg-white/5": active(dev.deviceId),
												}}
											>
												<span
													class="text-base"
													classList={{
														"icon-[mdi--check]": active(dev.deviceId),
														"icon-[mdi--loading] animate-spin":
															requested(dev.deviceId) && !active(dev.deviceId),
													}}
													style={{
														color:
															active(dev.deviceId) || requested(dev.deviceId)
																? "hsl(var(--link-hue) 60% 60%)"
																: "transparent",
													}}
												/>
												<span>{dev.label || `Microphone ${dev.deviceId.slice(0, 8)}`}</span>
											</button>
										))}
									</>
								)}
							</Match>
						</Switch>
					</div>
				</div>
			</Show>
		</div>
	);
}

export function Camera(props: { local: Local; room?: Room }): JSX.Element {
	const toggle = () => {
		props.local.webcam.enabled.set((prev: boolean) => !prev);
	};
	const media = solid(props.local.webcam.stream);

	const [showMenu, setShowMenu] = createSignal(false);
	const [deviceChangeIndicator, setDeviceChangeIndicator] = createSignal(false);
	const [deviceChangeMessage, setDeviceChangeMessage] = createSignal("");

	// Use device signals from the Device API
	const device = props.local.webcam.device;
	const available = solid(device.available);
	const requested = createSelector(solid(device.requested));
	const active = createSelector(solid(device.active));

	// Watch for device changes and trigger indicator
	let previousDeviceCount = available()?.length ?? 0;
	createEffect(() => {
		const currentDevices = available();
		const currentCount = currentDevices?.length ?? 0;
		if (currentCount !== previousDeviceCount && previousDeviceCount !== 0) {
			setDeviceChangeIndicator(true);
			if (currentCount > previousDeviceCount) {
				setDeviceChangeMessage("New camera detected");
			} else {
				setDeviceChangeMessage("Camera disconnected");
			}
			setTimeout(() => {
				setDeviceChangeIndicator(false);
				setDeviceChangeMessage("");
			}, 5000);
		}
		previousDeviceCount = currentCount;
	});

	// Close menu when clicking outside
	let menuRef: HTMLDivElement | undefined;
	let buttonRef: HTMLButtonElement | undefined;

	onMount(() => {
		const handleClick = (e: MouseEvent) => {
			if (
				showMenu() &&
				menuRef &&
				buttonRef &&
				!menuRef.contains(e.target as Node) &&
				!buttonRef.contains(e.target as Node)
			) {
				setShowMenu(false);
			}
		};

		document.addEventListener("click", handleClick);
		onCleanup(() => document.removeEventListener("click", handleClick));
	});

	// Request permissions
	const requestPermissions = () => {
		device.requestPermission();
	};

	// Handle device selection
	const selectDevice = (deviceId: string) => {
		if (media() && (deviceId === device.active.peek() || deviceId === device.requested.peek())) {
			// Same device selected and camera is enabled - disable it
			props.local.webcam.enabled.set(false);
			device.preferred.set(undefined);
		} else {
			// Different device or camera is disabled - enable it
			device.preferred.set(deviceId);
			props.local.webcam.enabled.set(true);
		}
	};

	return (
		<div class="flex items-start pointer-events-auto relative">
			<Tooltip content={media() ? "Disable camera" : "Enable camera"} position="top">
				<button
					type="button"
					onClick={toggle}
					class="relative border hover:bg-gray-700 transition-all cursor-pointer p-2 backdrop-blur-sm bg-transparent rounded"
					role="switch"
					aria-checked={!!media()}
					aria-label="Toggle camera"
					classList={{
						"border-white": !!media(),
						"border-transparent": !media(),
					}}
				>
					<span class={media() ? "icon-[mdi--camera]" : "icon-[mdi--camera-off]"} />
				</button>
			</Tooltip>
			<Show when={media() && (available()?.length ?? 0) > 1}>
				<Tooltip
					content={deviceChangeMessage() || "Camera settings"}
					position="top"
					force={deviceChangeIndicator()}
				>
					<button
						ref={buttonRef}
						type="button"
						onClick={() => setShowMenu(!showMenu())}
						class="text-xs hover:bg-white/10 transition-all cursor-pointer p-1 backdrop-blur-sm bg-transparent rounded mt-1"
						aria-label="Camera settings"
						aria-expanded={showMenu()}
						classList={{
							"animate-pulse": deviceChangeIndicator(),
						}}
					>
						<span class={showMenu() ? "icon-[mdi--chevron-up]" : "icon-[mdi--chevron-down]"} />
					</button>
				</Tooltip>
			</Show>
			<Show when={showMenu()}>
				<div
					ref={menuRef}
					class="absolute bottom-full mb-2 left-0 min-w-80 max-w-[calc(100vw-2rem)] bg-black/90 backdrop-blur-xl rounded-xl border border-white/20 shadow-2xl p-5 z-50"
				>
					{/* Title */}
					<h3 class="text-white font-semibold mb-1 text-2xl underline decoration-link-hue underline-offset-2">
						Camera Settings
					</h3>

					{/* Device selection */}
					<div class="flex flex-wrap gap-4">
						<div class="flex flex-col gap-1 w-full">
							<Switch>
								<Match when={available() === undefined}>
									<button
										type="button"
										onClick={requestPermissions}
										class="flex items-center justify-center gap-2 text-sm px-3 py-2.5 rounded-md bg-white/10 hover:bg-white/20 transition-colors cursor-pointer"
									>
										<span class="icon-[mdi--shield-check] text-base" />
										<span>Grant Camera Permission</span>
									</button>
								</Match>
								<Match when={available()?.length === 0}>
									<div class="text-sm text-white/40 px-3 py-2">No devices found</div>
								</Match>
								<Match when={available()}>
									{(devices) => (
										<>
											{devices().map((dev) => (
												<button
													type="button"
													onClick={() => selectDevice(dev.deviceId)}
													class="flex items-center gap-2 text-left text-sm px-3 py-2.5 rounded-md hover:bg-white/10 transition-colors cursor-pointer"
													classList={{
														"bg-white/5": active(dev.deviceId),
													}}
												>
													<span
														class="text-base"
														classList={{
															"icon-[mdi--check]": active(dev.deviceId),
															"icon-[mdi--loading] animate-spin":
																requested(dev.deviceId) && !active(dev.deviceId),
														}}
														style={{
															color:
																active(dev.deviceId) || requested(dev.deviceId)
																	? "hsl(var(--link-hue) 60% 60%)"
																	: "transparent",
														}}
													/>
													<span>{dev.label || `Camera ${dev.deviceId.slice(0, 8)}`}</span>
												</button>
											))}
										</>
									)}
								</Match>
							</Switch>
						</div>
					</div>
				</div>
			</Show>
		</div>
	);
}

function Screen(props: { local: Local; room: Room }): JSX.Element {
	const toggle = () => {
		props.local.screen.enabled.set((prev: boolean) => !prev);
	};
	const media = solid(props.local.screen.stream);

	return (
		<Tooltip content={media() ? "Disable screen sharing" : "Enable screen sharing"} position="top">
			<button
				type="button"
				onClick={toggle}
				class="relative border hover:bg-gray-700 transition-all cursor-pointer p-2 pointer-events-auto backdrop-blur-sm bg-transparent rounded"
				role="switch"
				aria-checked={!!media()}
				aria-label="Toggle screen sharing"
				classList={{
					"border-white": !!media(),
					"border-transparent": !media(),
				}}
			>
				<span class={media() ? "icon-[mdi--monitor-screenshot]" : "icon-[mdi--monitor-off]"} />
			</button>
		</Tooltip>
	);
}

// Renders a volume meter in the background of an element.
export function Visualize(props: { audio: Publish.Audio.Encoder }): JSX.Element {
	const [power, setPower] = createSignal<number | undefined>(undefined);
	const [speaking, setSpeaking] = createSignal(false);

	const top = createMemo(() => {
		return `${Math.round(Math.max(0, 100 - (power() ?? 0) * 100))}%`;
	});

	const color = createMemo(() => {
		const p = power();
		if (!p) return "transparent";
		const hue = 180 + p * 120;
		const alpha = 0.3 + p * 0.4;
		return `hsla(${hue}, 80%, 40%, ${alpha})`;
	});

	const speakingColor = createMemo(() => {
		const p = power();
		if (!p) return "transparent";
		const hue = 180 + p * 120;
		return `hsla(${hue}, 80%, 40%, 1)`;
	});

	const root = solid(props.audio.root);

	createEffect(() => {
		const node = root();
		if (!node) return;

		const analyzer = new AnalyserNode(node.context, {
			fftSize: 1024,
		});
		const data = new Uint8Array(analyzer.frequencyBinCount); // half of fftSize

		node.connect(analyzer);
		onCleanup(() => analyzer.disconnect());

		let animation: number | undefined;
		let smoothed = 0;

		const tick = () => {
			analyzer.getByteTimeDomainData(data);

			// Convert from [0, 255] to [-1, 1]
			let sum = 0;
			for (let i = 0; i < data.length; i++) {
				const sample = data[i] - 128;
				sum += sample * sample;
			}
			const power = Math.sqrt(sum) / data.length;
			smoothed = smoothed * 0.7 + power * 0.3;

			setPower(smoothed);
			animation = requestAnimationFrame(tick);

			setSpeaking(props.audio.speaking.active.peek() ?? false);
		};

		animation = requestAnimationFrame(tick);
		onCleanup(() => cancelAnimationFrame(animation ?? 0));
		onCleanup(() => setPower(undefined));
	});

	return (
		<div
			class="absolute bottom-0 left-0 w-full rounded"
			style={{
				top: top(),
				"border-top-width": speaking() ? "2px" : "0px",
				"border-top-color": speakingColor(),
				"background-color": color(),
			}}
		/>
	);
}

function Chat(props: { broadcast: Publish.Broadcast; room: Room }): JSX.Element {
	const [input, setInput] = createSignal<HTMLInputElement | undefined>(undefined);
	const [message, setMessage] = createSignal("");
	const [showMemeSelector, setShowMemeSelector] = createSignal(false);

	// Update typing status in preview
	createEffect(() => {
		const hasText = message().length > 0;
		props.broadcast.preview.info.set((prev) => ({
			...prev,
			typing: hasText,
		}));
	});

	const keydown = (e: KeyboardEvent) => {
		if (
			e.ctrlKey ||
			e.altKey ||
			e.metaKey ||
			["Tab", "Escape"].includes(e.key) ||
			document.activeElement instanceof HTMLInputElement ||
			document.activeElement instanceof HTMLTextAreaElement ||
			document.activeElement?.getAttribute("contenteditable") !== null ||
			e.key.length !== 1 || // Filters out keys like "ArrowLeft", "Escape", etc.
			e.key === " "
		)
			return;

		if (message().length !== 0) return;
		input()?.focus();

		// NOTE: The event will now be handled by the input field.
	};

	onMount(() => {
		window.addEventListener("keydown", keydown);
		onCleanup(() => window.removeEventListener("keydown", keydown));
	});

	createEffect(() => {
		const typing = message().length > 0;
		props.broadcast.chat.typing.active.set(typing);
	});

	const submit = (e: SubmitEvent) => {
		e.preventDefault();

		const m = message();
		if (!m) return;

		if (!props.broadcast.chat.message.enabled.peek()) return;

		// Use a function to avoid the dequal check.
		props.broadcast.chat.message.latest.set(() => m);

		setMessage("");
	};

	return (
		<div class="flex items-center gap-2 flex-1 min-w-48">
			<Tooltip content="Memes & Emojis" position="top">
				<button
					type="button"
					onClick={() => setShowMemeSelector((prev) => !prev)}
					aria-label="Open meme selector"
					aria-expanded={showMemeSelector()}
					class="hover:bg-gray-700 transition-all cursor-pointer p-2 pointer-events-auto backdrop-blur-sm bg-transparent rounded"
				>
					<span class="icon-[mdi--sticker-emoji]" />
				</button>
			</Tooltip>
			<Show when={showMemeSelector()}>
				<MemeSelector
					broadcast={props.broadcast}
					chatInput={input()}
					chatMessage={message()}
					setChatMessage={setMessage}
					onClose={() => setShowMemeSelector(false)}
				/>
			</Show>
			<form id="chat" onSubmit={submit} class="flex-1">
				<input
					type="text"
					autocomplete="off"
					placeholder="chat"
					ref={setInput}
					value={message()}
					onInput={(e) => setMessage(e.currentTarget.value)}
					aria-label="Chat message"
					tabIndex={0}
					class="w-full pointer-events-auto backdrop-blur-sm bg-transparent rounded py-1 px-2 outline-none text-center placeholder:text-center"
				/>
			</form>
		</div>
	);
}

function Volume(props: { room: Room }): JSX.Element {
	const [showSlider, setShowSlider] = createSignal(false);

	const toggle = () => {
		// If we were just suspended due to autoplay policies, then don't toggle mute.
		// This seems racey but maybe it works.
		if (props.room.space.sound.suspended.peek()) {
			props.room.space.sound.suspended.set(false);

			// If we unmuted but appeared to be muted, then don't toggle mute.
			if (!Settings.muted.peek()) {
				return;
			}
		}

		Settings.muted.set((prev) => !prev);
	};

	const muted = solid(Settings.muted);
	const volume = solid(Settings.volume);
	const opacity = Opacity(() => showSlider());
	const suspended = solid(props.room.space.sound.suspended);

	const setVolume = (v: number) => {
		if (v === 0) {
			Settings.muted.set(true);
			Settings.volume.set(1.0);
		} else {
			Settings.muted.set(false);
			Settings.volume.set(v);
		}
	};

	return (
		<Tooltip content={muted() || suspended() ? "Enable audio" : "Disable audio"} position="top">
			<fieldset
				class="flex flex-col-reverse pointer-events-auto"
				aria-label="Volume controls"
				onMouseEnter={() => setShowSlider(true)}
				onMouseLeave={() => setShowSlider(false)}
				onFocusIn={() => setShowSlider(true)}
				onFocusOut={() => setShowSlider(false)}
			>
				<button
					type="button"
					onClick={toggle}
					role="switch"
					aria-checked={!muted()}
					aria-label="Toggle mute"
					class="hover:bg-gray-700 transition-all cursor-pointer p-2 backdrop-blur-sm bg-transparent rounded"
					classList={{ "text-red-500": muted() || suspended() }}
				>
					<span class={muted() ? "icon-[mdi--volume-mute]" : "icon-[mdi--volume-high]"} />
				</button>
				<Show when={opacity() > 0}>
					<input
						type="range"
						min="0"
						step="0.01"
						max="2"
						value={muted() ? 0 : volume()}
						onInput={(e) => setVolume(Number(e.currentTarget.value))}
						class="cursor-pointer backdrop-blur-sm bg-transparent rounded py-1 px-2 outline-none"
						aria-label="Output Volume"
						style={{
							"writing-mode": "vertical-rl",
							direction: "rtl",
							opacity: opacity(),
						}}
					/>
				</Show>
			</fieldset>
		</Tooltip>
	);
}

// Temporarily disabled - Caption generation disabled
// function ClosedCaptions(): JSX.Element {
// 	const toggle = () => {
// 		Settings.renderCaptions.set((prev) => !prev);
// 	};

// 	const enabled = solid(Settings.renderCaptions);

// 	return (
// 		<Tooltip content={enabled() ? "Disable closed captions" : "Enable closed captions"} position="top">
// 			<button
// 				type="button"
// 				onClick={toggle}
// 				role="switch"
// 				aria-checked={enabled()}
// 				aria-label="Toggle closed captions"
// 				class="hover:bg-gray-700 transition-all cursor-pointer p-2 pointer-events-auto backdrop-blur-sm bg-transparent rounded"
// 			>
// 				{enabled() ? <IconClosedCaption /> : <IconClosedCaptionDisabled />}
// 			</button>
// 		</Tooltip>
// 	);
// }

function Advanced(props: { sound: Sound }): JSX.Element {
	const [showSettings, setShowSettings] = createSignal(false);
	const [button, setButton] = createSignal<HTMLButtonElement | undefined>(undefined);
	const [modal, setModal] = createSignal<HTMLDivElement | undefined>(undefined);

	// Reposition on show
	const toggle = () => {
		setShowSettings((prev) => !prev);
	};

	// Hide if clicked outside
	const handleClick = (e: MouseEvent) => {
		if (showSettings() && !button()?.contains(e.target as Node) && !modal()?.contains(e.target as Node)) {
			setShowSettings(false);
		}
	};

	onMount(() => {
		window.addEventListener("click", handleClick);
	});

	onCleanup(() => {
		window.removeEventListener("click", handleClick);
	});

	return (
		<>
			<Tooltip content="Settings" position="top">
				<button
					type="button"
					onClick={toggle}
					ref={setButton}
					aria-label="Settings"
					aria-expanded={showSettings()}
					aria-haspopup="dialog"
					class="hover:bg-gray-700 transition-all cursor-pointer p-2 pointer-events-auto backdrop-blur-sm bg-transparent rounded"
				>
					<span class="icon-[mdi--cog]" />
				</button>
			</Tooltip>

			<Show when={showSettings()}>
				<div ref={setModal} class="fixed z-[999] right-4 bottom-16 pointer-events-auto">
					<div class="bg-black/90 backdrop-blur-xl rounded-xl border border-white/20 shadow-2xl p-5">
						<Modal sound={props.sound} />
					</div>
				</div>
			</Show>
		</>
	);
}

function Fullscreen(props: { canvas: Canvas }): JSX.Element {
	const toggle = () => props.canvas.toggleFullscreen();

	const [isFullscreen, setIsFullscreen] = createSignal(false);

	onMount(() => {
		const checkFullscreen = () => {
			setIsFullscreen(!!document.fullscreenElement);
		};
		checkFullscreen();
		document.addEventListener("fullscreenchange", checkFullscreen);
		onCleanup(() => document.removeEventListener("fullscreenchange", checkFullscreen));
	});

	return (
		<Tooltip content={isFullscreen() ? "Exit fullscreen" : "Enter fullscreen"} position="top">
			<button
				type="button"
				onClick={toggle}
				aria-label="Toggle fullscreen"
				class="hover:bg-gray-700 transition-all cursor-pointer p-2 pointer-events-auto backdrop-blur-sm bg-transparent rounded"
			>
				<span class="icon-[mdi--fullscreen]" />
			</button>
		</Tooltip>
	);
}

// A function that transitions between 0 and 1 based on the input function.
function Opacity(fn: () => boolean): Accessor<number> {
	let animation: number | undefined;

	const [opacity, setOpacity] = createSignal(0);

	const updateOpacity = () => {
		if (fn()) {
			setOpacity((prev) => Math.min(1, prev + 0.1));
		} else {
			setOpacity((prev) => Math.max(0, prev - 0.025));
		}

		// Only animate if we're not at 0 or 1.
		if (opacity() !== 0 && opacity() !== 1) {
			animation = requestAnimationFrame(updateOpacity);
		} else {
			animation = undefined;
		}
	};

	// Request an animation frame when the function changes.
	createEffect(() => {
		fn();
		if (animation) {
			cancelAnimationFrame(animation);
		}
		animation = requestAnimationFrame(updateOpacity);
	});

	onCleanup(() => {
		if (animation) {
			cancelAnimationFrame(animation);
		}
	});

	return opacity;
}
