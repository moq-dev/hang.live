import * as Moq from "@moq/net";
import * as Signals from "@moq/signals";
import * as Watch from "@moq/watch";
import * as SolidWeb from "solid-js/web";
import * as Controls from "../src/controls";
import * as Room from "../src/room/local";
import * as Settings from "../src/settings";

type Kind = "camera" | "microphone";
type Mode = "live" | "hold" | "deny" | "missing";
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
if (params.has("missing")) modes[params.get("missing") === "camera" ? "camera" : "microphone"] = "missing";
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
// The newest timestamp each kind's encoders were handed, in milliseconds like the viewer's. A
// disable resets the viewer, and resubscribing can replay the last capture's cached group, so only
// media newer than this proves the current capture reaches it.
const encoded: Record<Kind, number> = { camera: 0, microphone: 0 };
const encodeVideo = VideoEncoder.prototype.encode;
VideoEncoder.prototype.encode = function (this: VideoEncoder, frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
	encoded.camera = Math.max(encoded.camera, frame.timestamp / 1000);
	encodeVideo.call(this, frame, options);
};
const encodeAudio = AudioEncoder.prototype.encode;
AudioEncoder.prototype.encode = function (this: AudioEncoder, data: AudioData) {
	encoded.microphone = Math.max(encoded.microphone, data.timestamp / 1000);
	encodeAudio.call(this, data);
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
	// A missing device stays missing for every retry; other modes apply once.
	if (mode !== "missing") modes[kind] = "live";
	if (mode === "deny") throw new DOMException("Capture permission denied", "NotAllowedError");
	if (mode === "missing") throw new DOMException("Requested device not found", "NotFoundError");
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
	local.microphone.constraints.set({ echoCancellation: false, noiseSuppression: false, autoGainControl: false });
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
		if (!source || "frames" in source) return undefined;
		return "track" in source ? source.track : source;
	}
	const source = local?.microphone.out.source.peek()?.audio;
	if (!source || "samples" in source) return undefined;
	return "track" in source ? source.track : source;
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
			encoded: { ...encoded },
			camera: track("camera")?.id,
			cameraError: local?.webcam.out.error.peek()?.message,
			microphoneError: local?.microphone.out.error.peek()?.message,
			cameraDevices: local?.webcam.device.out.available.peek()?.length,
			microphoneDevices: local?.microphone.device.out.available.peek()?.length,
			selectedMicrophone: local?.microphone.device.out.available
				.peek()
				?.find((device) => device.deviceId === Settings.default.microphone.device.peek())?.label,
			microphone: track("microphone")?.id,
			liveTracks: tracks.filter((track) => track.readyState === "live").length,
			held: held.length,
			video: player?.video.out.timestamp.peek()?.asMillis(),
			audio: player?.audio.out.timestamp.peek()?.asMillis(),
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
