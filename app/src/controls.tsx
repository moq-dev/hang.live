import type { Publish } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { type Accessor, batch, createEffect, createMemo, createSignal, onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconClosedCaption from "~icons/material-symbols/closed-caption";
import IconClosedCaptionDisabled from "~icons/material-symbols/closed-caption-disabled";
import IconCamera from "~icons/mdi/camera";
import IconCameraOff from "~icons/mdi/camera-off";
import IconSettings from "~icons/mdi/cog";
import IconFullscreen from "~icons/mdi/fullscreen";
import IconMicrophone from "~icons/mdi/microphone";
import IconMicrophoneOff from "~icons/mdi/microphone-off";
import IconScreenOff from "~icons/mdi/monitor-off";
import IconScreen from "~icons/mdi/monitor-screenshot";
import IconVolumeHigh from "~icons/mdi/volume-high";
import IconVolumeMute from "~icons/mdi/volume-mute";
import Tooltip from "./components/tooltip";
import type { Room } from "./room";
import type { Canvas } from "./room/canvas";
import Settings, { Modal } from "./settings";

export function Controls(props: {
	room: Room;
	camera: Publish.Broadcast;
	screen: Publish.Broadcast;
	canvas: Canvas;
}): JSX.Element {
	return (
		<div class="controls pointer-gaps" role="toolbar" aria-label="Media controls">
			{/* Left group */}
			<div class="flex gap-inherit">
				<Microphone audio={props.camera.audio} />
				<Camera video={props.camera.video} room={props.room} />
				<Screen video={props.screen.video} audio={props.screen.audio} room={props.room} />
			</div>

			{/* Center group */}
			<div class="flex-1 flex justify-center">
				<Chat broadcast={props.camera} />
			</div>

			{/* Right group */}
			<div class="flex gap-inherit">
				<Volume room={props.room} />
				<ClosedCaptions />
				<Advanced />
				<Fullscreen canvas={props.canvas} />
			</div>
		</div>
	);
}

function Microphone(props: { audio: Publish.Audio }): JSX.Element {
	const toggle = () => {
		props.audio.enabled.set((prev) => !prev);
	};
	const root = solid(props.audio.root);

	const [hover, setHover] = createSignal(false);
	const opacity = Opacity(() => hover() && !!root());

	const volume = solid(props.audio.volume);
	Settings.microphoneGain.subscribe((gain) => {
		props.audio.volume.set(gain);
	});

	return (
		<Tooltip content={root() ? "Disable microphone" : "Enable microphone"} position="top">
			<fieldset
				class="flex flex-col-reverse"
				aria-label="Microphone controls"
				onMouseEnter={() => setHover(true)}
				onMouseLeave={() => setHover(false)}
				onFocusIn={() => setHover(true)}
				onFocusOut={() => setHover(false)}
			>
				<button
					type="button"
					onClick={toggle}
					class="relative border hover:bg-gray-700 transition-all cursor-pointer p-2"
					role="switch"
					aria-checked={!!root()}
					aria-label="Toggle microphone"
					classList={{
						"border-white": !!root(),
						"border-transparent": !root(),
						"text-red-500": root() && volume() === 0,
					}}
				>
					<Visualize audio={props.audio} />
					{root() ? <IconMicrophone /> : <IconMicrophoneOff />}
				</button>
				<Show when={opacity() > 0}>
					<input
						type="range"
						min="0"
						step="0.01"
						max="2"
						value={volume()}
						onInput={(e) => Settings.microphoneGain.set(Number(e.currentTarget.value))}
						class="cursor-pointer"
						aria-label="Microphone volume"
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

function Camera(props: { video: Publish.Video; room: Room }): JSX.Element {
	const toggle = () => {
		props.video.enabled.set((prev) => !prev);
	};
	const media = solid(props.video.media);

	return (
		<Tooltip content={media() ? "Disable camera" : "Enable camera"} position="top">
			<button
				type="button"
				onClick={toggle}
				class="relative border hover:bg-gray-700 transition-all cursor-pointer p-2"
				role="switch"
				aria-checked={!!media()}
				aria-label="Toggle camera"
				classList={{
					"border-white": !!media(),
					"border-transparent": !media(),
				}}
			>
				{media() ? <IconCamera /> : <IconCameraOff />}
			</button>
		</Tooltip>
	);
}

function Screen(props: { video: Publish.Video; audio: Publish.Audio; room: Room }): JSX.Element {
	const toggle = () => {
		// We need to batch otherwise we'll request the device twice.
		batch(() => {
			props.video.enabled.set((prev) => !prev);
			props.audio.enabled.set((prev) => !prev);
		});
	};
	const media = solid(props.video.media);

	return (
		<Tooltip content={media() ? "Disable screen sharing" : "Enable screen sharing"} position="top">
			<button
				type="button"
				onClick={toggle}
				class="relative border hover:bg-gray-700 transition-all cursor-pointer p-2"
				role="switch"
				aria-checked={!!media()}
				aria-label="Toggle screen sharing"
				classList={{
					"border-white": !!media(),
					"border-transparent": !media(),
				}}
			>
				{media() ? <IconScreen /> : <IconScreenOff />}
			</button>
		</Tooltip>
	);
}

// Renders a volume meter in the background of an element.
function Visualize(props: { audio: Publish.Audio }): JSX.Element {
	const [power, setPower] = createSignal<number | undefined>(undefined);
	const [speaking, setSpeaking] = createSignal(false);

	const top = createMemo(() => {
		return `${Math.max(0, 100 - (power() ?? 0) * 100)}%`;
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

			setSpeaking(props.audio.captions.speaking.peek() ?? false);
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

function Chat(props: { broadcast: Publish.Broadcast }): JSX.Element {
	const [input, setInput] = createSignal<HTMLInputElement | undefined>(undefined);
	const [message, setMessage] = createSignal("");

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
		setMessage(e.key);

		input()?.focus();
	};

	onMount(() => {
		window.addEventListener("keydown", keydown);
		onCleanup(() => window.removeEventListener("keydown", keydown));
	});

	const submit = (e: SubmitEvent) => {
		e.preventDefault();

		const m = message();
		if (!m) return;

		if (!props.broadcast.chat.enabled.peek()) return;

		// Use a function to avoid the dequal check.
		props.broadcast.chat.message.set(() => m);

		setMessage("");
	};

	return (
		<form id="chat" onSubmit={submit} class="w-full max-w-md">
			<input
				type="text"
				autocomplete="off"
				placeholder="type to chat"
				ref={setInput}
				value={message()}
				onInput={(e) => setMessage(e.currentTarget.value)}
				aria-label="Chat message"
				tabIndex={0}
				class="w-full text-center placeholder:text-center"
			/>
		</form>
	);
}

function Volume(props: { room: Room }): JSX.Element {
	const [showSlider, setShowSlider] = createSignal(false);

	const toggle = () => {
		// If we were just suspended due to autoplay policies, then don't toggle mute.
		// This seems racey but maybe it works.
		if (props.room.sound.suspended.peek()) {
			props.room.sound.suspended.set(false);

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
	const suspended = solid(props.room.sound.suspended);

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
				class="flex flex-col-reverse"
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
					class="hover:bg-gray-700 transition-all cursor-pointer p-2"
					classList={{ "text-red-500": muted() || suspended() }}
				>
					{muted() ? <IconVolumeMute /> : <IconVolumeHigh />}
				</button>
				<Show when={opacity() > 0}>
					<input
						type="range"
						min="0"
						step="0.01"
						max="2"
						value={muted() ? 0 : volume()}
						onInput={(e) => setVolume(Number(e.currentTarget.value))}
						class="cursor-pointer"
						aria-label="Output Volume"
						style={{
							"writing-mode": "vertical-rl",
							direction: "rtl",
							"vertical-align": "middle",
							opacity: opacity(),
						}}
					/>
				</Show>
			</fieldset>
		</Tooltip>
	);
}

function ClosedCaptions(): JSX.Element {
	const toggle = () => {
		Settings.renderCaptions.set((prev) => !prev);
	};

	const enabled = solid(Settings.renderCaptions);

	return (
		<Tooltip content={enabled() ? "Disable closed captions" : "Enable closed captions"} position="top">
			<button
				type="button"
				onClick={toggle}
				role="switch"
				aria-checked={enabled()}
				aria-label="Toggle closed captions"
				class="hover:bg-gray-700 transition-all cursor-pointer p-2"
			>
				{enabled() ? <IconClosedCaption /> : <IconClosedCaptionDisabled />}
			</button>
		</Tooltip>
	);
}

function Advanced(): JSX.Element {
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
					class="hover:bg-gray-700 transition-all cursor-pointer p-2"
				>
					<IconSettings />
				</button>
			</Tooltip>

			<Show when={showSettings()}>
				<div ref={setModal} class="fixed z-[999] p-4 rounded-lg backdrop-blur-sm right-0 bottom-[42px] text-sm">
					<Modal />
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
			setIsFullscreen(document.fullscreenElement === props.canvas.element);
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
				class="hover:bg-gray-700 transition-all cursor-pointer p-2"
			>
				<IconFullscreen />
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
