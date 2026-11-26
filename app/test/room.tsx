import * as Moq from "@moq/net";
import { Room } from "../src/room";
import { Canvas } from "../src/room/canvas";
import { BroadcastRenderer } from "../src/room/gl/broadcast";
import { Local } from "../src/room/local";
import { Sound } from "../src/room/sound";
import { Textures } from "../src/room/video";
import Settings from "../src/settings";

const params = new URLSearchParams(location.search);
const element = document.querySelector("canvas");
if (!element) throw new Error("Missing canvas");

// The newest camera timestamp this page's encoders were handed, in microseconds like decoded frames.
let encoded = 0;
const encode = VideoEncoder.prototype.encode;
VideoEncoder.prototype.encode = function (this: VideoEncoder, frame: VideoFrame, options?: VideoEncoderEncodeOptions) {
	encoded = Math.max(encoded, frame.timestamp);
	encode.call(this, frame, options);
};
// Tracked per set of textures, since a restored context gives each tile new ones.
const ids = new WeakMap<Textures, number>();
let next = 0;
// The timestamp of the newest video frame uploaded to, and then drawn from, each set of textures.
const uploaded = new WeakMap<Textures, number>();
const drawn = new WeakMap<Textures, number>();
const errors: number[] = [];
const upload = Textures.prototype.upload;
Textures.prototype.upload = function (this: Textures, texture: WebGLTexture, source: TexImageSource) {
	if (texture === this.frame && source instanceof VideoFrame) uploaded.set(this, source.timestamp);
	upload.call(this, texture, source);
};
// Count GL draw calls, so a tile render that skips its draw does not pass.
let calls = 0;
const drawElements = WebGL2RenderingContext.prototype.drawElements;
WebGL2RenderingContext.prototype.drawElements = function (this: WebGL2RenderingContext, ...args) {
	calls++;
	drawElements.apply(this, args);
};
const render = BroadcastRenderer.prototype.render;
BroadcastRenderer.prototype.render = function (this: BroadcastRenderer, ...args: Parameters<typeof render>) {
	const before = calls;
	render.apply(this, args);
	const [broadcast] = args;
	const textures = broadcast.video.textures.peek();
	const timestamp = textures ? uploaded.get(textures) : undefined;
	if (textures && timestamp !== undefined && calls > before) drawn.set(textures, timestamp);
	// A frame can still draw between losing the context and its event, which only reports the loss.
	const gl = broadcast.canvas.context.peek()?.gl;
	if (!gl || gl.isContextLost()) return;
	const error = gl.getError();
	if (error !== gl.NO_ERROR) errors.push(error);
};

// The room plays a notification once its camera publishes, but the sounds live in Git LFS,
// which CI and a clone made without git-lfs hold only as undecodable pointers.
Sound.prototype.load = async function (this: Sound) {
	return new AudioBuffer({ length: 1, sampleRate: this.context.sampleRate });
};

Settings.camera.enabled.set(true);
const connection = new Moq.Connection({ url: new URL(params.get("relay") ?? ""), share: false });
const canvas = new Canvas(element);
const gl = canvas.context.peek()?.gl;
// Kept from the start, since a lost context hands out no extensions.
const lose = gl?.getExtension("WEBGL_lose_context");
if (!lose) throw new Error("Missing WEBGL_lose_context");
const sound = new Sound({ enabled: false });
const local = new Local({ connection, identity: Moq.Path.from(params.get("name") ?? "") });
Local.join.set(true);
const room = new Room({ connection, canvas, sound, local });

const harness = {
	lose() {
		lose.loseContext();
	},
	restore() {
		lose.restoreContext();
	},
	state() {
		return {
			context: !!canvas.context.peek(),
			encoded,
			errors: [...errors],
			remotes: room.space.ordered
				.peek()
				.filter((broadcast) => broadcast.source.role === "watch")
				.map((broadcast) => {
					const textures = broadcast.video.textures.peek();
					if (!textures) return {};
					if (!ids.has(textures)) ids.set(textures, ++next);
					return { textures: ids.get(textures), drawn: drawn.get(textures) };
				}),
		};
	},
	close() {
		room.close();
		local.close();
		sound.close();
		canvas.close();
		connection.close();
	},
};
window.roomTest = harness;
declare global {
	interface Window {
		roomTest: typeof harness;
	}
}
