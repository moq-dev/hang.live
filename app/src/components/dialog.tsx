import { createSignal, onMount } from "solid-js";

export default function Dialog(props: {
	icon: string; // Tailwind icon class like "icon-[mdi--information-outline]"
	title: string;
	description: string;
	variant?: "info" | "error";
}) {
	const variant = props.variant || "info";
	const [mounted, setMounted] = createSignal(false);

	const colors = {
		info: {
			bg: "bg-[hsl(var(--link-hue),75%,40%,0.1)]",
			border: "border-[hsl(var(--link-hue),75%,40%)]",
			icon: "text-[hsl(var(--link-hue),75%,40%)]",
			title: "text-[hsl(var(--link-hue),75%,50%)]",
		},
		error: {
			bg: "bg-red-500/10",
			border: "border-red-500",
			icon: "text-red-500",
			title: "text-red-500",
		},
	};

	const style = colors[variant];

	// Trigger mount animation
	onMount(() => {
		requestAnimationFrame(() => setMounted(true));
	});

	return (
		<div
			class={`mt-8 ${style.bg} border ${style.border} rounded-xl p-4 overflow-hidden transition-all duration-300 ease-out`}
			classList={{
				"opacity-0 max-h-0 mt-0 p-0": !mounted(),
				"opacity-100 max-h-32": mounted(),
			}}
			style={{
				"transition-property": "max-height, opacity, margin-top, padding, background-color, border-color",
			}}
		>
			<div class="grid gap-3 grid-cols-[auto_1fr] justify-center items-center transition-colors duration-300">
				<span class={`${props.icon} w-4 h-4 inline-block ${style.icon} transition-colors duration-300`} />
				<span class={`${style.title} font-medium transition-colors duration-300`}>{props.title}</span>
				<span class="text-gray-400 text-sm col-start-2">{props.description}</span>
			</div>
		</div>
	);
}
