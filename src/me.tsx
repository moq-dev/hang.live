import { Connection, Publish } from "@kixelated/hang";
import { batch, createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";

const inputCss: JSX.CSSProperties = {
	color: "white",
	padding: "8px 12px",
	"border-radius": "4px",
	background: "transparent",
	border: "1px solid transparent",
	"backdrop-filter": "blur(2px)",
	"text-shadow": "-1px -1px 0 black, 1px -1px 0 black, -1px 1px 0 black, 1px 1px 0 black",
};

const buttonCss: JSX.CSSProperties = {
	cursor: "pointer",
	...inputCss,
};

export type MeProps = {
	connection: Connection;
	name: string;
};

export function Me(props: MeProps): JSX.Element {
	const camera = new Publish.Broadcast(props.connection, {
		device: "camera",
		video: false,
		audio: false,
		path: props.name,
	});

	onCleanup(() => camera.close());

	const screen = new Publish.Broadcast(props.connection, {
		device: "screen",
		publish: false,
		path: `${props.name}/screen`,
	});
	onCleanup(() => screen.close());

	createEffect(() => {
		// Publish only once we have at least one active track.
		screen.publish.set(!!screen.video.media.get() || !!screen.audio.media.get());
	});

	return (
		<div
			style={{
				position: "fixed",
				bottom: "0",
				left: "0",
				right: "0",
				display: "flex",
				"align-items": "center",
				padding: "8px 16px",
				gap: "8px",
			}}
		>
			<Microphone audio={camera.audio} />
			<Camera video={camera.video} />
			<Screen video={screen.video} audio={screen.audio} />
			<Chat />
			<div style={{ "flex-grow": "1" }} />
			<Settings />
			<Fullscreen />
		</div>
	);
}

function Microphone(props: { audio: Publish.Audio }): JSX.Element {
	const toggle = (e: MouseEvent) => {
		e.preventDefault();

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
				...buttonCss,
				position: "relative",
				"border-color": props.audio.media.get() ? "white" : "transparent",
			}}
		>
			<Volume audio={props.audio} />🎤
		</button>
	);
}

function Camera(props: { video: Publish.Video }): JSX.Element {
	const toggle = (e: MouseEvent) => {
		e.preventDefault();

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
			style={{ ...buttonCss, "border-color": props.video.media.get() ? "white" : "transparent" }}
			onClick={toggle}
		>
			📷
		</button>
	);
}

function Screen(props: { video: Publish.Video; audio: Publish.Audio }): JSX.Element {
	const toggle = (e: MouseEvent) => {
		e.preventDefault();

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
			style={{ ...buttonCss, "border-color": props.video.media.get() ? "white" : "transparent" }}
			onClick={toggle}
		>
			🖥️
		</button>
	);
}

// Renders a volume meter in the background of an element.
function Volume(props: { audio: Publish.Audio }): JSX.Element {
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
	return <input type="text" placeholder="Type a message..." style={inputCss} />;
}

function Settings(): JSX.Element {
	return (
		<button type="button" style={buttonCss}>
			⚙️
		</button>
	);
}

function Fullscreen(): JSX.Element {
	return (
		<button type="button" style={buttonCss}>
			⛶
		</button>
	);
}
