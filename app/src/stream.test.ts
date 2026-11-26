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
	expect(ingest.capture).toBe(
		"moq --connect 'https://relay.example/hang/friends?jwt=pub.lish.token' --broadcast external/abc/camera.hang import capture",
	);
	expect(ingest.rtsp).toContain("--broadcast external/abc/camera.hang import rtsp --connect rtsp://");
});

test("egress watches with the subscribe token, never the publish one", () => {
	for (const command of Object.values(Stream.egress(external, "guest/alice/camera.hang"))) {
		expect(command).toContain("?jwt=sub.scribe.token' --broadcast guest/alice/camera.hang export ");
		expect(command).not.toContain(external.publish);
	}
});
