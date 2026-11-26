import { expect, test } from "bun:test";
import * as Stream from "./stream";

const external: Stream.External = {
	relay: "https://relay.example/hang/friends",
	path: "external/abc",
	publish: "pub.lish.token",
	subscribe: "sub.scribe.token",
	lifetime: 3600,
};

test("ingest publishes with the publish token beneath the minted identity", () => {
	expect(Stream.url(external.relay, external.publish)).toBe("https://relay.example/hang/friends?jwt=pub.lish.token");
	const ingest = Stream.ingest(external);
	expect(ingest.rtmp).toBe(
		"moq --connect 'https://relay.example/hang/friends?jwt=pub.lish.token' --broadcast 'external/abc/camera.hang' import rtmp --listen 127.0.0.1:1935",
	);
	expect(ingest.rtsp).toEndWith(
		"| moq --connect 'https://relay.example/hang/friends?jwt=pub.lish.token' --broadcast 'external/abc/camera.hang' import ts",
	);
});

test("egress watches with the subscribe token, never the publish one", () => {
	for (const command of Object.values(Stream.egress(external, "guest/alice/camera.hang"))) {
		expect(command).toContain("?jwt=sub.scribe.token' --broadcast 'guest/alice/camera.hang' export ");
		expect(command).not.toContain(external.publish);
	}
});

test("a participant's chosen path stays one literal shell argument", () => {
	const { hls } = Stream.egress(external, "guest/a/'$(touch pwned)'/camera.hang");
	expect(hls).toContain(`--broadcast 'guest/a/'\\''$(touch pwned)'\\''/camera.hang' export hls`);
});
