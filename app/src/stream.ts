// Ready-to-paste settings and `moq` commands for streaming into or out of a room from outside the browser.
// The commands use only what the released CLI that `moq.sh` installs supports.

import * as Moq from "@moq/net";
import { broadcastPath } from "@moq/room";

/** What the API mints for a tool outside Hang. */
export interface External {
	relay: string;
	/** The fresh identity the publish token streams beneath. */
	path: string;
	publish: string;
	subscribe: string;
	lifetime: number;
}

/** The relay URL carrying `token`, which OBS, moq-studio, and the CLI all read. */
export function url(relay: string, token: string): string {
	const url = new URL(relay);
	url.searchParams.set("jwt", token);
	return url.toString();
}

/** Where a tool streams its camera, so the room opens it like a participant's. */
export function broadcast(external: External): string {
	return broadcastPath(Moq.Path.from(external.path), "camera");
}

/** Whether `path` can go in a pasted command: a terminal may act on control characters before the shell quotes them. */
export function pasteable(path: string): boolean {
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
	return !/[\u0000-\u001f\u007f-\u009f]/.test(path);
}

// One literal shell argument: a participant picks its own path, so it must never run as shell syntax.
function quote(text: string): string {
	return `'${text.replaceAll("'", `'\\''`)}'`;
}

function moq(relay: string, token: string, broadcast: string): string {
	return `moq --connect ${quote(url(relay, token))} --broadcast ${quote(broadcast)}`;
}

/** CLI commands that stream into the room under the minted identity. */
export function ingest(external: External): { rtmp: string; rtsp: string } {
	const into = moq(external.relay, external.publish, broadcast(external));
	return {
		rtmp: `${into} import rtmp --listen 127.0.0.1:1935`,
		// Cameras often send G.711 audio, which the TS importer doesn't carry, so only the video passes through as is.
		rtsp: `ffmpeg -i rtsp://camera.local/stream -c:v copy -c:a aac -f mpegts - | ${into} import ts`,
	};
}

/** CLI commands that restream or record the broadcast at `path`, which only need to watch. */
export function egress(external: External, path: string): { hls: string; rtmp: string; record: string } {
	const from = moq(external.relay, external.subscribe, path);
	return {
		hls: `${from} export hls`,
		rtmp: `${from} export rtmp --connect rtmp://live.example.com/app/STREAM_KEY`,
		// A file per run, and noclobber so two runs started in the same second fail instead of sharing one.
		record: `(set -C; ${from} export fmp4 > "recording-$(date +%s).mp4")`,
	};
}
