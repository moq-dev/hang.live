import { Publish } from "@kixelated/hang";
import { Show, batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { Room } from "./room";
import { Modal } from "./settings";

import IconMicrophone from "~icons/mdi/microphone";
import IconCamera from "~icons/mdi/camera";
import IconScreen from "~icons/mdi/monitor-screenshot";
import IconSettings from "~icons/mdi/cog";
import IconFullscreen from "~icons/mdi/fullscreen";
import IconVolumeMute from "~icons/mdi/volume-mute";
import IconVolumeHigh from "~icons/mdi/volume-high";

export function Controls(props: {
	room: Room;
	camera: Publish.Broadcast;
	screen: Publish.Broadcast;
	canvas: HTMLCanvasElement;
}): JSX.Element {
	return (
		<div class="controls pointer-gaps">
			<Microphone audio={props.camera.audio} />
			<Camera video={props.camera.video} room={props.room} />
			<Screen video={props.screen.video} audio={props.screen.audio} room={props.room} />
			<Chat broadcast={props.camera} />
			<div style={{ "flex-grow": "1", "pointer-events": "none", "backdrop-filter": "none" }} />
			<Volume room={props.room} />
			<Settings />
			<Fullscreen canvas={props.canvas} />
		</div>
	);
}

function Microphone(props: { audio: Publish.Audio }): JSX.Element {
	const toggle = () => {
		props.audio.enabled.set((prev) => !prev);
	};

	return (
		<button
			type="button"
			onClick={toggle}
			class={`relative ${props.audio.media.get() ? "border-white" : "border-transparent"}`}
		>
			<Visualize audio={props.audio} />
			<IconMicrophone />
		</button>
	);
}

function Camera(props: { video: Publish.Video; room: Room }): JSX.Element {
	const toggle = () => {
		props.video.enabled.set((prev) => !prev);
	};

	// Play a sound when a media device is selected.
	createEffect(() => {
		if (props.video.media.get()) {
			props.room.notifications.play("select");
		}
	});

	return (
		<button
			type="button"
			style={{ "border-color": props.video.media.get() ? "white" : "transparent" }}
			onClick={toggle}
		>
			<IconCamera />
		</button>
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

	// Play a sound when a media device is selected.
	createEffect(() => {
		if (props.video.media.get()) {
			props.room.notifications.play("select");
		}
	});

	return (
		<button
			type="button"
			style={{ "border-color": props.video.media.get() ? "white" : "transparent" }}
			onClick={toggle}
		>
			<IconScreen />
		</button>
	);
}

// Renders a volume meter in the background of an element.
function Visualize(props: { audio: Publish.Audio }): JSX.Element {
	const [power, setPower] = createSignal<number | undefined>(undefined);

	const top = createMemo(() => {
		return `${Math.max(0, 100 - (power() ?? 0) * 100)}%`;
	});

	const color = createMemo(() => {
		const p = power();
		if (!p) return "transparent";
		const hue = 2 ** p * 100 + 135;
		return `hsla(${hue}, 80%, 40%, 0.75)`;
	});

	createEffect(() => {
		const media = props.audio.media.get();
		if (!media) {
			setPower(undefined);
			return;
		}

		const context = new AudioContext({
			sampleRate: media.getSettings().sampleRate,
		});
		onCleanup(() => context.close());

		const analyzer = new AnalyserNode(context, {
			fftSize: 2048,
		});
		onCleanup(() => analyzer.disconnect());

		const source = context.createMediaStreamSource(new MediaStream([media]));
		source.connect(analyzer);
		onCleanup(() => source.disconnect());

		const data = new Uint8Array(analyzer.frequencyBinCount);

		let animation: number | undefined;
		let smoothed = 0;

		const updatePower = () => {
			analyzer.getByteTimeDomainData(data);

			// Convert from [0, 255] to [-1, 1]
			let sum = 0;
			for (let i = 0; i < data.length; i++) {
				const sample = data[i] - 128;
				sum += sample * sample;
			}
			const power = (2 * Math.sqrt(sum)) / data.length;
			smoothed = smoothed * 0.7 + power * 0.3;

			setPower(smoothed);
			animation = requestAnimationFrame(updatePower);
		};

		animation = requestAnimationFrame(updatePower);
		onCleanup(() => cancelAnimationFrame(animation ?? 0));
	});

	return (
		<div
			class="absolute bottom-0 left-0 w-full"
			style={{
				top: top(),
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

		if (!props.broadcast.chat.enabled.get()) return;
		props.broadcast.chat.publish(m);

		setMessage("");
	};

	return (
		<form onSubmit={submit} class="flex-1 min-w-48">
			<input
				type="text"
				autocomplete="off"
				placeholder="chat"
				ref={setInput}
				value={message()}
				onInput={(e) => setMessage(e.currentTarget.value)}
				aria-label="Chat message"
				class="w-full"
			/>
		</form>
	);
}

function Volume(props: { room: Room }): JSX.Element {
	const [showSlider, setShowSlider] = createSignal(false);

	const toggle = () => {
		props.room.muted.set(!props.room.muted.get());
	};

	return (
		<div
			class="relative inline-block"
			onMouseEnter={() => setShowSlider(true)}
			onMouseLeave={() => setShowSlider(false)}
			onFocusIn={() => setShowSlider(true)}
			onFocusOut={() => setShowSlider(false)}
		>
			<button type="button" onClick={toggle}>
				{props.room.muted.get() ? <IconVolumeMute /> : <IconVolumeHigh />}
			</button>
			<Show when={showSlider()}>
				<div
					class="absolute bottom-full left-1/2 -translate-x-1/2 flex items-center justify-center"
					onMouseEnter={() => setShowSlider(true)}
					onMouseLeave={() => setShowSlider(false)}
				>
					<input
						type="range"
						min="0"
						max="100"
						value={props.room.volume.get() * 100}
						onInput={(e) => props.room.volume.set(Number(e.currentTarget.value) / 100)}
						style={{ transform: "rotate(-90deg) translate(60px)" }}
						class="cursor-pointer px-2 py-1"
					/>
				</div>
			</Show>
		</div>
	);
}

function Settings(): JSX.Element {
	const [showSettings, setShowSettings] = createSignal(false);
	const [button, setButton] = createSignal<HTMLButtonElement | undefined>(undefined);
	const [modal, setModal] = createSignal<HTMLDivElement | undefined>(undefined);

	// Reposition on show
	const toggle = () => {
		const next = !showSettings();
		setShowSettings(next);
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
			<button type="button" onClick={toggle} ref={setButton}>
				<IconSettings />
			</button>

			<Show when={showSettings()}>
				<div ref={setModal} class="fixed z-[999] p-4 rounded-lg backdrop-blur-sm right-0 bottom-[42px] text-sm">
					<Modal />
				</div>
			</Show>
		</>
	);
}

function Fullscreen(props: { canvas: HTMLCanvasElement }): JSX.Element {
	const toggle = () => {
		if (document.fullscreenElement === props.canvas) {
			document.exitFullscreen();
		} else {
			props.canvas.requestFullscreen();
		}
	};

	return (
		<button type="button" onClick={toggle}>
			<IconFullscreen />
		</button>
	);
}
