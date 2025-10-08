import { Accessor, createEffect, createSignal, onCleanup, Show } from "solid-js";

export default function AnotherOne(props: { clicks: Accessor<number> }) {
	// Duration breakpoints for the meme video (in seconds)
	const BREAKPOINTS = [1.0, 3.0, 5.0, 7.0, 9.0, 11.0, 13.0];

	// Meme video state
	const [show, setShow] = createSignal<boolean>(false);
	const [visible, setVisible] = createSignal<boolean>(false);
	const [video, setVideo] = createSignal<HTMLVideoElement | undefined>(undefined);

	let breakpoint = 0;
	let breakpointClicks = 10; // require 10 clicks to start the video
	let breakpointTimestamp = BREAKPOINTS[0];

	createEffect(() => {
		if (props.clicks() < breakpointClicks - 1) return;
		// Start loading the video, but don't show it yet
		setShow(true);
	});

	createEffect(() => {
		if (props.clicks() < breakpointClicks) return;
		if (breakpoint + 1 >= BREAKPOINTS.length) return; // don't loop
		setVisible(true);
	});

	let checkCancel: number | undefined;
	const checkTimeline = () => {
		const v = video();
		if (!v) return;

		if (v.currentTime >= breakpointTimestamp) {
			if (breakpointClicks === props.clicks() || breakpoint + 1 >= BREAKPOINTS.length) {
				setVisible(false);
				return;
			}

			breakpoint++;
			breakpointTimestamp = BREAKPOINTS[breakpoint];
			breakpointClicks = props.clicks();
		}

		checkCancel = requestAnimationFrame(checkTimeline);
	};

	createEffect(() => {
		const v = video();
		if (!v) return;

		if (visible()) {
			v.volume = 0.5;
			v.play();

			if (!checkCancel) {
				checkCancel = requestAnimationFrame(checkTimeline);
			}
		} else {
			v.pause();

			if (checkCancel) {
				cancelAnimationFrame(checkCancel);
				checkCancel = undefined;
			}
		}
	});

	createEffect(() => {
		const v = video();
		if (!v) return;

		onCleanup(() => {
			v.pause();
			v.src = "";
		});

		onCleanup(() => {
			if (checkCancel) {
				cancelAnimationFrame(checkCancel);
				checkCancel = undefined;
			}
		});
	});

	return (
		<Show when={show()}>
			<div class="absolute -top-24 left-1/2 transform -translate-x-1/2 pointer-events-none z-50">
				<video
					src={new URL("/meme/another-one.webm", import.meta.env.VITE_APP_URL).toString()}
					class="w-20 h-20 object-cover rounded-lg transition-opacity duration-500"
					classList={{
						"opacity-0": !visible(),
						"opacity-90": visible(),
					}}
					ref={setVideo}
					style={{
						filter: "drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5))",
						"mix-blend-mode": "screen",
					}}
				/>
			</div>
		</Show>
	);
}
