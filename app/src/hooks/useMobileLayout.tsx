import { createSignal, onCleanup, onMount } from "solid-js";

export type MobileSection = "publish" | "chat" | "settings" | null;

export function useMobileLayout() {
	const [isMobile, setIsMobile] = createSignal(false);
	const [expandedSection, setExpandedSection] = createSignal<MobileSection>(null);

	const checkMobile = () => {
		setIsMobile(window.innerWidth < 768);
	};

	onMount(() => {
		checkMobile();
		window.addEventListener("resize", checkMobile);
		onCleanup(() => window.removeEventListener("resize", checkMobile));
	});

	const toggleSection = (section: MobileSection) => {
		setExpandedSection((prev) => (prev === section ? null : section));
	};

	const collapseAll = () => {
		setExpandedSection(null);
	};

	return {
		isMobile,
		expandedSection,
		toggleSection,
		collapseAll,
	};
}
