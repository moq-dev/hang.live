// Ready-to-paste settings and `moq` commands for streaming into or out of a room from outside the browser.

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

/** CLI commands that stream into the room under the minted identity. */
export function ingest(external: External): { capture: string; rtsp: string } {
	const moq = `moq --connect '${url(external.relay, external.publish)}' --broadcast ${broadcast(external)} import`;
	return {
		capture: `${moq} capture`,
		rtsp: `${moq} rtsp --connect rtsp://camera.local/stream`,
	};
}

/** CLI commands that restream or record the broadcast at `path`, which only need to watch. */
export function egress(external: External, path: string): { hls: string; rtmp: string; mp4: string } {
	const moq = `moq --connect '${url(external.relay, external.subscribe)}' --broadcast ${path} export`;
	return {
		hls: `${moq} hls --hls-listen '[::]:8089'`,
		rtmp: `${moq} rtmp --connect rtmp://live.example.com/app/STREAM_KEY`,
		mp4: `${moq} mp4 --output recording.mp4`,
	};
}
