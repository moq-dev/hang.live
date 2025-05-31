import { Publish } from "@kixelated/hang";
import { batch, createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";
import { Room } from "./room";

export function Controls(props: { room: Room; camera: Publish.Broadcast; screen: Publish.Broadcast }): JSX.Element {
	return (
		<div
			style={{
				position: "fixed",
				bottom: "0",
				left: "0",
				right: "0",
				display: "flex",
				"align-items": "center",
				gap: "8px",
				margin: "8px",
			}}
			class="controls"
		>
			<Microphone audio={props.camera.audio} />
			<Camera video={props.camera.video} />
			<Screen video={props.screen.video} audio={props.screen.audio} />
			<Chat />
			<div style={{ "flex-grow": "1", "pointer-events": "none" }} />
			<Volume room={props.room} />
			<Fullscreen />
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
			// Monitor the last x samples of audio.
			// ex. at 48kHz, 4096 samples is 85ms.
			fftSize: 4096,
		});
		onCleanup(() => analyzer.disconnect());

		const source = context.createMediaStreamSource(new MediaStream([media]));
		source.connect(analyzer);
		onCleanup(() => source.disconnect());

		const data = new Uint8Array(analyzer.frequencyBinCount);

		let animation: number | undefined;

		const updatePower = () => {
			analyzer.getByteTimeDomainData(data);

			// Convert from [0, 255] to [-1, 1]
			let sum = 0;
			for (let i = 0; i < data.length; i++) {
				const sample = (data[i] - 128) / 128;
				sum += sample * sample;
			}
			const power = 2 * Math.sqrt(sum / data.length);
			setPower(power);
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

function Chat(): JSX.Element {
	return <input type="text" placeholder="Type a message..." />;
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
						height: "100px",
						width: "50px",
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
							transform: "rotate(-90deg)",
							width: "100px",
							height: "50px",
							cursor: "pointer",
						}}
					/>
				</div>
			</Show>
		</div>
	);
}

/*
function Settings(): JSX.Element {
	return (
		<button type="button">
			⚙️
		</button>
	);
}
*/

function Fullscreen(): JSX.Element {
	return <button type="button">⛶</button>;
}
