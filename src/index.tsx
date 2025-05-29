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
	const room = new Room(connection, canvas);
	onCleanup(() => room.close());

	const camera = new Publish.Broadcast(connection, {
		device: "camera",
		video: false,
		audio: false,
		// Always publish the camera/avatar.
		publish: true,
		path: "me",
		location: {
			enabled: true,
			position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
		},
	});

	setInterval(() => {
		camera.location.position.set({ x: Math.random() - 0.5, y: Math.random() - 0.5 });
	}, 1000);

	onCleanup(() => camera.close());

	const screen = new Publish.Broadcast(connection, {
		device: "screen",
		publish: false,
		path: "me/screen",
		location: {
			enabled: true,
			position: { x: Math.random() - 0.5, y: Math.random() - 0.5 },
		},
	});
	onCleanup(() => screen.close());

	createEffect(() => {
		// Publish only once we have at least one active track.
		screen.publish.set(!!screen.video.media.get() || !!screen.audio.media.get());
	});

	// Register any window/document level events.
	const resize = () => {
		canvas.width = window.devicePixelRatio * window.innerWidth;
		canvas.height = window.devicePixelRatio * window.innerHeight;
	};

	const visible = () => {
		room.visible.set(document.visibilityState !== "hidden");
	};

	resize();
	visible();

	window.addEventListener("resize", resize);
	document.addEventListener("visibilitychange", visible);

	// Determine when the user has interacted with the page so we can potentially unmute audio.
	document.addEventListener("click", () => room.suspended.set(false), { once: true });
	document.addEventListener("keydown", () => room.suspended.set(false), { once: true });

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
