import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { Portal } from "solid-js/web";

export default function Tooltip(props: {
	content: string;
	position: "top" | "bottom" | "left" | "right";
	children: JSX.Element;
}) {
	const [show, setShow] = createSignal(false);
	const [triggerEl, setTriggerEl] = createSignal<HTMLElement>();
	const [tooltipEl, setTooltipEl] = createSignal<HTMLElement>();
	const [arrowPosition, setArrowPosition] = createSignal({ left: "50%", top: "50%" });

	const updatePosition = () => {
		const trigger = triggerEl();
		const tooltip = tooltipEl();
		if (!trigger || !tooltip) return;

		const triggerRect = trigger.getBoundingClientRect();
		const tooltipRect = tooltip.getBoundingClientRect();
		const viewport = { width: window.innerWidth, height: window.innerHeight };

		let left = 0;
		let top = 0;

		switch (props.position) {
			case "top":
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				top = triggerRect.top - tooltipRect.height - 8;
				break;
			case "bottom":
				left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
				top = triggerRect.bottom + 8;
				break;
			case "left":
				left = triggerRect.left - tooltipRect.width - 8;
				top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				break;
			case "right":
				left = triggerRect.right + 8;
				top = triggerRect.top + triggerRect.height / 2 - tooltipRect.height / 2;
				break;
		}

		// Keep tooltip within viewport bounds
		left = Math.max(8, Math.min(left, viewport.width - tooltipRect.width - 8));
		top = Math.max(8, Math.min(top, viewport.height - tooltipRect.height - 8));

		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;

		// Calculate arrow position based on where the tooltip ended up vs where it should be
		let arrowLeft = "50%";
		let arrowTop = "50%";

		if (props.position === "top" || props.position === "bottom") {
			// For horizontal arrows, calculate left offset
			const triggerCenter = triggerRect.left + triggerRect.width / 2;
			const tooltipLeft = left;
			const arrowOffset = triggerCenter - tooltipLeft;
			const clampedOffset = Math.max(8, Math.min(arrowOffset, tooltipRect.width - 8));
			arrowLeft = `${clampedOffset}px`;
		} else {
			// For vertical arrows, calculate top offset
			const triggerCenter = triggerRect.top + triggerRect.height / 2;
			const tooltipTop = top;
			const arrowOffset = triggerCenter - tooltipTop;
			const clampedOffset = Math.max(8, Math.min(arrowOffset, tooltipRect.height - 8));
			arrowTop = `${clampedOffset}px`;
		}

		setArrowPosition({ left: arrowLeft, top: arrowTop });
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: Tooltip wrapper needs to work with arbitrary children
		<div
			class="relative inline-flex"
			role="button"
			tabIndex={0}
			ref={setTriggerEl}
			onMouseEnter={() => {
				setShow(true);
				// Use requestAnimationFrame to ensure tooltip is rendered before positioning
				requestAnimationFrame(updatePosition);
			}}
			onMouseLeave={() => setShow(false)}
			onFocus={() => {
				setShow(true);
				requestAnimationFrame(updatePosition);
			}}
			onBlur={() => setShow(false)}
		>
			{props.children}
			<Show when={show()}>
				<Portal>
					<div
						ref={setTooltipEl}
						class="fixed z-[9999] px-2 py-1 text-xs text-white bg-gray-900 border border-gray-700 rounded shadow-xl whitespace-nowrap pointer-events-none transition-opacity duration-200"
						style={{ left: "0px", top: "0px" }}
					>
						{props.content}
						{/* Arrow pointing toward the trigger */}
						<div
							class="absolute w-2 h-2 bg-gray-900 border-gray-700 transform rotate-45"
							style={{
								left:
									props.position === "top" || props.position === "bottom"
										? arrowPosition().left
										: props.position === "left"
											? "100%"
											: "-4px",
								top:
									props.position === "left" || props.position === "right"
										? arrowPosition().top
										: props.position === "top"
											? "100%"
											: "-4px",
								transform:
									props.position === "top" || props.position === "bottom"
										? "translateX(-50%)"
										: "translateY(-50%)",
							}}
							classList={{
								// Tooltip above trigger: arrow points down from tooltip bottom
								"border-r border-b": props.position === "top",
								// Tooltip below trigger: arrow points up from tooltip top
								"border-l border-t": props.position === "bottom",
								// Tooltip left of trigger: arrow points right from tooltip right side
								"border-b border-r": props.position === "left",
								// Tooltip right of trigger: arrow points left from tooltip left side
								"border-t border-l": props.position === "right",
							}}
						/>
					</div>
				</Portal>
			</Show>
		</div>
	);
}
