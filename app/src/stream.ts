// Ready-to-paste settings and `moq` commands for streaming into or out of a room from outside the browser.
// The commands use only what the released CLI that `moq.sh` installs supports.

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
	return `${external.path}/camera.hang`;
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
		rtsp: `ffmpeg -i rtsp://camera.local/stream -c copy -f mpegts - | ${into} import ts`,
	};
}

/** CLI commands that restream or record the broadcast at `path`, which only need to watch. */
export function egress(external: External, path: string): { hls: string; rtmp: string; record: string } {
	const from = moq(external.relay, external.subscribe, path);
	return {
		hls: `${from} export hls`,
		rtmp: `${from} export rtmp --connect rtmp://live.example.com/app/STREAM_KEY`,
		record: `${from} export fmp4 > recording.mp4`,
	};
}
