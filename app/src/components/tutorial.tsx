import solid from "@kixelated/signals/solid";
import { onCleanup, onMount, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import Settings from "../settings";

export function Tutorial(): JSX.Element {
	const step = solid(Settings.tutorial.step);

	const supportsScreenShare = "mediaDevices" in navigator && "getDisplayMedia" in navigator.mediaDevices;

	const steps = [
		{
			title: "Share Stuff",
			description: supportsScreenShare
				? "Enable your microphone or webcam down here. Or share your screen, just make sure you close that tab first. You know the one."
				: "Enable your microphone or camera down here.",
			arrow: "bottom-left",
			styles: { bottom: "5rem", left: "1rem" },
		},
		{
			title: "Talk Stuff",
			description: "Spam unfunny messages down here. There's also a dank meme selector below.",
			arrow: "bottom",
			styles: { bottom: "5rem", left: "50%", transform: "translateX(-50%)" },
		},
		{
			title: "Advanced Stuff",
			description: "Cool, I guess.",
			arrow: "bottom-right",
			styles: { bottom: "5rem", right: "1rem" },
		},
		{
			title: "Other Stuff",
			description: "Favorite the room if you want to hang later. Or skip the pleasantries and dip.",
			arrow: "top-right",
			styles: { top: "5rem", right: "1rem" },
		},
	];

	const nextStep = () => {
		Settings.tutorial.step.set(step() + 1);
	};

	const skipTutorial = () => {
		Settings.tutorial.step.set(steps.length);
	};

	onMount(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === "Escape" && step() < steps.length) {
				skipTutorial();
			}
		};
		document.addEventListener("keydown", handleEscape);
		onCleanup(() => document.removeEventListener("keydown", handleEscape));
	});

	return (
		<Show when={step() < steps.length}>
			{/* Backdrop */}
			<button
				type="button"
				class="fixed inset-0 backdrop-blur-sm  bg-black/50 z-[1000] pointer-events-auto border-none p-0 m-0"
				onClick={skipTutorial}
				aria-label="Close tutorial"
			/>

			{/* Tutorial tooltip */}
			<div
				class="fixed z-[1001] bg-black/70 rounded-xl border border-white/20 shadow-2xl p-5 max-w-sm pointer-events-auto"
				style={steps[step()].styles}
			>
				<div class="flex items-start justify-between mb-2">
					<h3 class="text-xl font-semibold text-white underline decoration-link-hue underline-offset-2">
						{steps[step()].title}
					</h3>
					<button
						type="button"
						onClick={skipTutorial}
						class="text-white/60 hover:text-white transition-colors -mt-1"
						aria-label="Skip tutorial"
					>
						<span class="icon-[mdi--close] text-xl" />
					</button>
				</div>

				<p class="text-white/80 mb-4 text-sm leading-relaxed">{steps[step()].description}</p>

				<div class="flex items-center justify-between">
					<div class="flex gap-1.5">
						{steps.map((_, index) => (
							<div
								class="w-2 h-2 rounded-full transition-all duration-200"
								style={{
									"background-color":
										index === step() ? "hsl(var(--link-hue) 60% 60%)" : "rgba(255, 255, 255, 0.3)",
								}}
							/>
						))}
					</div>

					<div class="flex gap-2">
						<button
							type="button"
							onClick={skipTutorial}
							class="px-3 py-1.5 text-sm text-white/60 hover:text-white transition-colors rounded-md hover:bg-white/5 cursor-pointer"
						>
							Skip
						</button>
						<button
							type="button"
							onClick={nextStep}
							class="px-4 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-md transition-colors text-white font-medium cursor-pointer"
							classList={{
								"bg-link-hue": step() === steps.length - 1,
							}}
						>
							{step() < steps.length - 1 ? "Next" : "Got it!"}
						</button>
					</div>
				</div>

				{/* Arrow */}
				<div
					class="absolute w-2 h-2 bg-black/70 border-white/20 transform rotate-45"
					classList={{
						"border-t border-l": steps[step()].arrow.startsWith("top"),
						"border-b border-r": steps[step()].arrow.startsWith("bottom"),
					}}
					style={{
						left: steps[step()].arrow.endsWith("left")
							? "2rem"
							: steps[step()].arrow.endsWith("right")
								? "calc(100% - 2rem)"
								: "50%",
						bottom: steps[step()].arrow.startsWith("bottom") ? "-4px" : undefined,
						top: steps[step()].arrow.startsWith("top") ? "-4px" : undefined,
					}}
				/>
			</div>
		</Show>
	);
}
