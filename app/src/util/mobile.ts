import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

export function isMobile(): Accessor<boolean> {
	const detectMobile = () => {
		return window.innerWidth < 768;
	};

	const [isMobile, setIsMobile] = createSignal(detectMobile());
	const checkMobile = () => setIsMobile(detectMobile());

	onMount(() => {
		window.addEventListener("resize", checkMobile);
		onCleanup(() => window.removeEventListener("resize", checkMobile));
	});

	return isMobile;
}
