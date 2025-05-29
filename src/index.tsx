import { Connection, Publish, Support } from "@kixelated/hang";
import { Room } from "./room";
import { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { createEffect, onCleanup } from "solid-js";
import { Controls } from "./controls";

const RELAY = "http://localhost:4443";

export function Hang(): JSX.Element {
	const canvas = (
		<canvas
			style={{
				display: "block",
				"background-color": "#000",
				width: "100%",
				height: "100%",
			}}
		/>
	) as HTMLCanvasElement;

	const url = new URL(`${RELAY}/demo/`);
	const connection = new Connection({ url });

	const camera = new Publish.Broadcast(connection, {
		device: "camera",
		video: false,
		audio: false,
		// Always publish the camera/avatar.
		enabled: true,
		path: "me.hang",
		location: {
			enabled: true,
			position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
		},
	});

	const screen = new Publish.Broadcast(connection, {
		device: "screen",
		enabled: false,
		path: "me/screen.hang",
		location: {
			enabled: true,
			position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
		},
	});

	createEffect(() => {
		// Publish our screen share once we have at least one active track.
		screen.enabled.set(!!screen.video.media.get() || !!screen.audio.media.get());
	});

	const room = new Room(connection, canvas, camera, screen);
	onCleanup(() => room.close());

	return (
		<div>
			{canvas}
			<Controls room={room} camera={camera} screen={screen} />
		</div>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);

const support = document.getElementById("support");
if (!support) {
	throw new Error("No support element found");
}

render(() => <Support.Modal show="partial" />, support);
