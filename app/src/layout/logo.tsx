import * as Moq from "@kixelated/moq";
import solid from "@kixelated/signals/solid";
import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";

export function Logo(props: { connection?: Moq.Connection.Reload }) {
	const status = props.connection ? solid(props.connection.status) : () => "connected";

	const text = createMemo(() => {
		if (status() === "disconnected") return "offline";
		return "live";
	});

	const [hover, setHover] = createSignal<boolean>(false);

	const [hang, setHang] = createSignal<string>(`/image/hang/0.svg`);
	const [live, setLive] = createSignal<string>(`/image/live/0.svg`);
	const [offline, setOffline] = createSignal<string>(`/image/offline/0.svg`);

	// Helper function to cycle through images
	const createImageCycler = (folder: string, count: number, setter: (src: string) => void) => {
		createEffect(() => {
			if (!hover()) return;

			let active = true;
			const cycleImage = async () => {
				while (active && hover()) {
					const id = Math.floor(Math.random() * count);
					const img = new Image();

					// Wait for image to load before switching
					await new Promise<void>((resolve) => {
						img.onload = () => resolve();
						img.onerror = () => resolve(); // Continue even if image fails to load
						img.src = `/image/${folder}/${id}.svg`;
					});

					if (active && hover()) {
						setter(img.src);
						// Wait 150ms before next image
						await new Promise((resolve) => setTimeout(resolve, 150));
					}
				}
			};

			cycleImage();
			onCleanup(() => {
				active = false;
			});
		});
	};

	// Create image cyclers for each type
	createImageCycler("hang", 10, setHang);
	createImageCycler("live", 11, setLive);
	createImageCycler("offline", 6, setOffline);

	return (
		<a
			href="/home"
			class="rounded bg-black/80 backdrop-blur-sm px-4 py-2 text-2xl text-white hover:bg-gray-700 hover:text-gray-100 transition-all cursor-pointer flex gap-4"
			onmouseover={() => setHover(true)}
			onmouseleave={() => setHover(false)}
		>
			<img src={hang()} alt="hang" class="w-24" />
			<img
				src={status() === "disconnected" ? offline() : live()}
				alt={text()}
				class={status() === "disconnected" ? "w-20" : "w-10"}
			/>
		</a>
	);
}
