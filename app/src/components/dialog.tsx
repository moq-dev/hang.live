import { ComponentProps, JSX } from "solid-js";

export default function Dialog(props: {
	Icon: (props: ComponentProps<"svg">) => JSX.Element;
	title: string;
	description: string;
}) {
	return (
		<div class="mt-8 bg-[hsl(var(--link-hue),75%,40%,0.1)] border border-[hsl(var(--link-hue),75%,40%)] rounded-xl p-4">
			<div class="grid gap-3 grid-cols-[auto_1fr] justify-center items-center">
				<props.Icon class="w-4 h-4 inline-block text-[hsl(var(--link-hue),75%,40%)]" />
				<span class="text-[hsl(var(--link-hue),75%,50%)] font-medium">{props.title}</span>
				<span class="text-gray-400 col-start-2">{props.description}</span>
			</div>
		</div>
	);
}
