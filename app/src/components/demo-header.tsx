import type { JSX } from "solid-js/jsx-runtime";

export default function DemoHeader(): JSX.Element {
	return (
		<div class="absolute top-0 left-0 m-4 z-10 px-4 py-2 bg-black/70 backdrop-blur-sm rounded-lg">
			<div class="text-2xl font-bold text-white/90 underline decoration-link-hue underline-offset-2">DEMO</div>
		</div>
	);
}
