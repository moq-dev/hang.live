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

// Count per set of textures, since a restored context gives each tile new ones.
const ids = new WeakMap<Textures, number>();
let next = 0;
const frames = new WeakMap<Textures, number>();
const drawn = new WeakMap<Textures, number>();
const errors: number[] = [];
const upload = Textures.prototype.upload;
Textures.prototype.upload = function (this: Textures, texture: WebGLTexture, source: TexImageSource) {
	upload.call(this, texture, source);
	if (texture === this.frame) frames.set(this, (frames.get(this) ?? 0) + 1);
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
	// New textures first get the last decoded frame again, so only a later upload proves video still flows.
	if (textures && (frames.get(textures) ?? 0) > 1 && calls > before)
		drawn.set(textures, (drawn.get(textures) ?? 0) + 1);
	// A frame can still draw between losing the context and its event, which only reports the loss.
	const gl = broadcast.canvas.context.peek()?.gl;
	if (!gl || gl.isContextLost()) return;
	const error = gl.getError();
	if (error !== gl.NO_ERROR) errors.push(error);
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
			errors: [...errors],
			remotes: room.space.ordered
				.peek()
				.filter((broadcast) => broadcast.source.role === "watch")
				.map((broadcast) => {
					const textures = broadcast.video.textures.peek();
					if (!textures) return {};
					if (!ids.has(textures)) ids.set(textures, ++next);
					return {
						textures: ids.get(textures),
						frames: frames.get(textures) ?? 0,
						drawn: drawn.get(textures) ?? 0,
					};
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
