import { Publish } from "@kixelated/hang";
import { Show, batch, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { Room } from "./room";
import { Modal } from "./settings";

export function Controls(props: {
	room: Room;
	camera: Publish.Broadcast;
	screen: Publish.Broadcast;
	canvas: HTMLCanvasElement;
}): JSX.Element {
	return (
		<div class="controls pointer-gaps">
			<Microphone audio={props.camera.audio} />
			<Camera video={props.camera.video} />
			<Screen video={props.screen.video} audio={props.screen.audio} />
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
		const audio = props.audio.constraints.peek()
			? undefined
			: {
					channelCount: { ideal: 2, max: 2 },
					echoCancellation: { ideal: true },
					autoGainControl: { ideal: true },
					noiseCancellation: { ideal: true },
				};
		props.audio.constraints.set(audio);
	};

	return (
		<button
			type="button"
			onClick={toggle}
			style={{
				position: "relative",
				"border-color": props.audio.media.get() ? "white" : "transparent",
			}}
		>
			<Visualize audio={props.audio} />🎤
		</button>
	);
}

function Camera(props: { video: Publish.Video }): JSX.Element {
	const toggle = () => {
		const video: Publish.VideoConstraints | undefined = props.video.constraints.peek()
			? undefined
			: {
					// 480p but square, so the browser can choose the best aspect ratio.
					width: { ideal: 640 },
					height: { ideal: 640 },
					frameRate: { ideal: 60 },
					facingMode: { ideal: "user" },
					resizeMode: "none",
				};
		props.video.constraints.set(video);
	};

	return (
		<button
			type="button"
			style={{ "border-color": props.video.media.get() ? "white" : "transparent" }}
			onClick={toggle}
		>
			📷
		</button>
	);
}

function Screen(props: { video: Publish.Video; audio: Publish.Audio }): JSX.Element {
	const toggle = () => {
		// We need to batch otherwise we'll request the device twice.
		batch(() => {
			props.video.constraints.set(
				props.video.constraints.peek()
					? undefined
					: {
							frameRate: { ideal: 60 },
							resizeMode: "none",
						},
			);
			props.audio.constraints.set(
				props.audio.constraints.peek()
					? undefined
					: {
							channelCount: { ideal: 2, max: 2 },
						},
			);
		});
	};

	return (
		<button
			type="button"
			style={{ "border-color": props.video.media.get() ? "white" : "transparent" }}
			onClick={toggle}
		>
			🖥️
		</button>
	);
}

// Renders a volume meter in the background of an element.
function Visualize(props: { audio: Publish.Audio }): JSX.Element {
	const [power, setPower] = createSignal<number | undefined>(undefined);

	const top = createMemo(() => {
		return `${Math.min(100, 100 - (power() ?? 0) * 100)}%`;
	});

	const color = createMemo(() => {
		const p = power();
		if (!p) return "transparent";
		const hue = 2 ** p * 100 + 135;
		return `hsla(${hue}, 80%, 40%, 0.75)`;
	});

	createEffect(() => {
		const media = props.audio.media.get();
		if (!media) return;

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
			style={{
				position: "absolute",
				bottom: "0",
				left: "0",
				width: "100%",
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
			document.activeElement instanceof HTMLInputElement
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
		<form onSubmit={submit} style={{ "flex-grow": message() ? "1" : "0" }}>
			<input
				ref={setInput}
				type="text"
				value={message()}
				onInput={(e) => setMessage(e.currentTarget.value)}
				aria-label="Chat message"
				placeholder="chat"
				autocomplete="off"
				style={{ width: "100%" }}
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
			style={{
				position: "relative",
				display: "inline-block",
			}}
			onMouseEnter={() => setShowSlider(true)}
			onMouseLeave={() => setShowSlider(false)}
			onFocusIn={() => setShowSlider(true)}
			onFocusOut={() => setShowSlider(false)}
		>
			<button type="button" onClick={toggle}>
				{props.room.muted.get() ? "🔇" : "🔊"}
			</button>
			<Show when={showSlider()}>
				<div
					style={{
						position: "absolute",
						bottom: "100%",
						left: "50%",
						transform: "translateX(-50%)",
						display: "flex",
						"align-items": "center",
						"justify-content": "center",
					}}
					onMouseEnter={() => setShowSlider(true)}
					onMouseLeave={() => setShowSlider(false)}
				>
					<input
						type="range"
						min="0"
						max="100"
						value={props.room.volume.get() * 100}
						onInput={(e) => props.room.volume.set(Number(e.currentTarget.value) / 100)}
						style={{
							transform: "rotate(-90deg) translate(50px)",
							cursor: "pointer",
							padding: "14px 6px",
						}}
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
				⚙️
			</button>

			<Show when={showSettings()}>
				<div
					ref={setModal}
					style={{
						position: "fixed",
						"z-index": 999,
						padding: "16px",
						"border-radius": "8px",
						"backdrop-filter": "blur(4px)",
						right: 0,
						bottom: "42px",
						"font-size": "0.5em",
					}}
				>
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
			⛶
		</button>
	);
}
