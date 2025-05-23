import { Connection } from "@kixelated/hang";
import { Me } from "./me";
import { Room } from "./room";
import { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";

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

	// Register any window/document level events.
	const resize = () => {
		canvas.width = window.devicePixelRatio * window.innerWidth;
		canvas.height = window.devicePixelRatio * window.innerHeight;
	};

	const visible = () => {
		room.visible = document.visibilityState !== "hidden";
	};

	resize();
	visible();

	window.addEventListener("resize", resize);
	document.addEventListener("visibilitychange", visible);

	return (
		<>
			{canvas}
			<Me connection={connection} name="me" />
		</>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);
