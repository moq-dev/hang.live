import { createSignal, onMount, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";

const TUTORIAL_STORAGE_KEY = "hang-tutorial-completed";

export function Tutorial(): JSX.Element {
	const [currentStep, setCurrentStep] = createSignal(0);
	const [showTutorial, setShowTutorial] = createSignal(false);

	onMount(() => {
		const completed = localStorage.getItem(TUTORIAL_STORAGE_KEY);
		if (!completed) {
			setShowTutorial(true);
		}
	});

	const steps = [
		{
			title: "Publish Media",
			description: "Enable your microphone, camera, or screen sharing",
			position: "bottom-left",
			styles: { bottom: "5rem", left: "1rem" },
		},
		{
			title: "Chat",
			description: "Send messages to others in the room",
			position: "bottom-center",
			styles: { bottom: "5rem", left: "50%", transform: "translateX(-50%)" },
		},
		{
			title: "Settings",
			description: "Adjust volume, advanced settings, and fullscreen",
			position: "bottom-right",
			styles: { bottom: "5rem", right: "1rem" },
		},
		{
			title: "Navigation",
			description: "Leave room, favorite, share, and account settings",
			position: "top-right",
			styles: { top: "5rem", right: "1rem" },
		},
	];

	const nextStep = () => {
		if (currentStep() < steps.length - 1) {
			setCurrentStep(currentStep() + 1);
		} else {
			completeTutorial();
		}
	};

	const skipTutorial = () => {
		completeTutorial();
	};

	const completeTutorial = () => {
		localStorage.setItem(TUTORIAL_STORAGE_KEY, "true");
		setShowTutorial(false);
	};

	return (
		<Show when={showTutorial()}>
			{/* Backdrop */}
			<button
				type="button"
				class="fixed inset-0 bg-black/70 z-[1000] pointer-events-auto border-none p-0 m-0"
				onClick={skipTutorial}
				onKeyDown={(e) => e.key === "Escape" && skipTutorial()}
				aria-label="Close tutorial"
			/>

			{/* Tutorial tooltip */}
			<div
				class="fixed z-[1001] bg-black/95 backdrop-blur-xl rounded-xl border border-white/30 shadow-2xl p-6 max-w-sm pointer-events-auto"
				style={steps[currentStep()].styles}
			>
				<div class="flex items-start justify-between mb-3">
					<h3 class="text-xl font-bold text-white">{steps[currentStep()].title}</h3>
					<button
						type="button"
						onClick={skipTutorial}
						class="text-white/60 hover:text-white transition-colors"
						aria-label="Skip tutorial"
					>
						<span class="icon-[mdi--close] text-xl" />
					</button>
				</div>

				<p class="text-white/80 mb-4 text-sm">{steps[currentStep()].description}</p>

				<div class="flex items-center justify-between">
					<div class="flex gap-1.5">
						{steps.map((_, index) => (
							<div
								class="w-2 h-2 rounded-full transition-colors"
								classList={{
									"bg-white": index === currentStep(),
									"bg-white/30": index !== currentStep(),
								}}
							/>
						))}
					</div>

					<div class="flex gap-2">
						<button
							type="button"
							onClick={skipTutorial}
							class="px-3 py-1.5 text-sm text-white/60 hover:text-white transition-colors"
						>
							Skip
						</button>
						<button
							type="button"
							onClick={nextStep}
							class="px-4 py-1.5 text-sm bg-white/10 hover:bg-white/20 rounded-lg transition-colors text-white"
						>
							{currentStep() < steps.length - 1 ? "Next" : "Got it!"}
						</button>
					</div>
				</div>
			</div>
		</Show>
	);
}
