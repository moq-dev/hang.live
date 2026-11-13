import * as Moq from "@moq/net";
import * as Publish from "@moq/publish";
import * as Signals from "@moq/signals";
import * as Watch from "@moq/watch";
import * as SolidWeb from "solid-js/web";
import * as Controls from "../src/controls";
import * as Room from "../src/room/local";
import * as Settings from "../src/settings";

type Kind = "camera" | "microphone";
type Mode = "live" | "hold" | "deny";
type CodecStage = "support" | "flush";
const params = new URLSearchParams(location.search);
const connection = new Moq.Connection({ url: new URL(params.get("relay") ?? ""), share: false });

if (params.has("missing")) {
	const enumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);
	navigator.mediaDevices.enumerateDevices = async () =>
		(await enumerate()).filter(
			(device) => device.kind !== (params.get("missing") === "camera" ? "videoinput" : "audioinput"),
		);
}
const native = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
const modes: Record<Kind, Mode> = { camera: "live", microphone: "live" };
if (params.has("missing")) modes[params.get("missing") === "camera" ? "camera" : "microphone"] = "hold";
const tracks: MediaStreamTrack[] = [];
const held: (() => void)[] = [];
const hold = () => new Promise<void>((resolve) => held.push(resolve));
let codec: CodecStage | undefined;
const supported = VideoEncoder.isConfigSupported.bind(VideoEncoder);
VideoEncoder.isConfigSupported = async (config) => {
	const pending = codec === "support";
	const result = await supported(config);
	if (pending) await hold();
	return result;
};
const flush = VideoEncoder.prototype.flush;
VideoEncoder.prototype.flush = async function (this: VideoEncoder) {
	const pending = codec === "flush";
	await flush.call(this);
	if (pending) await hold();
};
navigator.mediaDevices.getUserMedia = async (constraints) => {
	const kind = constraints?.video ? "camera" : "microphone";
	const mode = modes[kind];
	modes[kind] = "live";
	if (mode === "deny") throw new DOMException("Capture permission denied", "NotAllowedError");
	const stream = await native(constraints);
	tracks.push(...stream.getTracks());
	if (mode === "hold") await hold();
	return stream;
};

const player = params.has("viewer")
	? new Watch.Player({
			origin: connection.origin,
			name: Moq.Path.from("alice/camera.hang"),
			video: {
				canvas: document.querySelector("canvas") ?? undefined,
				visible: "always",
				backend: "2d",
				target: { name: "video/hd" },
			},
		})
	: undefined;
const local = player ? undefined : new Room.Local({ connection, identity: Moq.Path.from("alice") });
let dispose: (() => void) | undefined;
if (local) {
	Room.Local.join.set(true);
	local.core.microphone.constraints.set({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
	const controls = document.getElementById("controls");
	if (!controls) throw new Error("Missing controls");
	dispose = SolidWeb.render(
		() => (
			<>
				<Controls.Camera local={local} />
				<Controls.Microphone local={local} />
			</>
		),
		controls,
	);
}
const effects = new Signals.Effect();
let analyser: AnalyserNode | undefined;
if (player)
	effects.run((effect) => {
		const root = effect.get(player.audio.out.root);
		if (!root) return;
		const node = root.context.createAnalyser();
		root.connect(node);
		analyser = node;
		effect.cleanup(() => {
			root.disconnect(node);
			analyser = undefined;
		});
	});
function track(kind: Kind): MediaStreamTrack | undefined {
	if (kind === "camera") {
		const source = local?.webcam.out.source.peek()?.video;
		return source && !("frames" in source) ? Publish.Video.normalizeSource(source).track : undefined;
	}
	const source = local?.microphone.out.source.peek()?.audio;
	return source && !Publish.Audio.isSampleSource(source) ? Publish.Audio.normalizeSource(source).track : undefined;
}
const harness = {
	codec(stage: CodecStage | undefined) {
		codec = stage;
	},
	mode(kind: Kind, mode: Mode) {
		modes[kind] = mode;
	},
	release() {
		for (const resume of held.splice(0)) resume();
	},
	choose(kind: Kind) {
		const device = kind === "camera" ? local?.webcam.device : local?.microphone.device;
		const id = device?.out.available.peek()?.[0]?.deviceId;
		if (!device || !id) throw new Error("Missing capture device");
		const preferred = Settings.default[kind].device;
		preferred.set(preferred.peek() === id ? undefined : id);
	},
	end(kind: Kind) {
		const active = track(kind);
		active?.stop();
		active?.dispatchEvent(new Event("ended"));
	},
	state() {
		const samples = new Float32Array(analyser?.fftSize ?? 0);
		analyser?.getFloatTimeDomainData(samples);
		const rms = samples.length
			? Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length)
			: 0;
		return {
			rms,
			camera: track("camera")?.id,
			selectedMicrophone: local?.microphone.device.out.available
				.peek()
				?.find((device) => device.deviceId === Settings.default.microphone.device.peek())?.label,
			microphone: track("microphone")?.id,
			liveTracks: tracks.filter((track) => track.readyState === "live").length,
			held: held.length,
			video: player?.video.out.timestamp.peek(),
			audio: player?.audio.out.timestamp.peek(),
			videoFrames: player?.video.out.stats.peek()?.frameCount,
			audioBytes: player?.audio.out.stats.peek()?.bytesReceived,
			videoError: player?.video.out.error.peek()?.message,
			audioError: player?.audio.out.error.peek()?.message,
		};
	},
	close() {
		effects.close();
		dispose?.();
		local?.close();
		player?.close();
		connection.close();
	},
};
window.mediaTest = harness;
declare global {
	interface Window {
		mediaTest: typeof harness;
	}
}
