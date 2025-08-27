export default function Dialog(props: {
	icon: string; // Tailwind icon class like "icon-[mdi--information-outline]"
	title: string;
	description: string;
	variant?: "info" | "error";
}) {
	const variant = props.variant || "info";

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

	return (
		<div class={`mt-8 ${style.bg} border ${style.border} rounded-xl p-4`}>
			<div class="grid gap-3 grid-cols-[auto_1fr] justify-center items-center">
				<span class={`${props.icon} w-4 h-4 inline-block ${style.icon}`} />
				<span class={`${style.title} font-medium`}>{props.title}</span>
				<span class="text-gray-400 col-start-2">{props.description}</span>
			</div>
		</div>
	);
}
