import { type Accessor, createSignal, onCleanup, onMount } from "solid-js";

// Whether the window is narrow enough for the mobile layout, updated on resize.
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
