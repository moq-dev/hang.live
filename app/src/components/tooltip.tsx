import { createEffect, createSignal, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { Portal } from "solid-js/web";

export default function Tooltip(props: {
	content: string;
	position: "top" | "bottom";
	children: JSX.Element;
	force?: boolean;
}) {
	const [show, setShow] = createSignal(false);
	const [triggerEl, setTriggerEl] = createSignal<HTMLElement>();
	const [tooltipEl, setTooltipEl] = createSignal<HTMLElement>();
	const [arrowLeft, setArrowLeft] = createSignal("50%");

	const updatePosition = () => {
		const trigger = triggerEl();
		const tooltip = tooltipEl();
		if (!trigger || !tooltip) return;

		const triggerRect = trigger.getBoundingClientRect();
		const tooltipRect = tooltip.getBoundingClientRect();
		const viewport = { width: window.innerWidth, height: window.innerHeight };

		const triggerCenter = triggerRect.left + triggerRect.width / 2;
		let left = triggerCenter - tooltipRect.width / 2;
		let top = props.position === "top" ? triggerRect.top - tooltipRect.height - 8 : triggerRect.bottom + 8;

		// Keep tooltip within viewport bounds
		left = Math.max(8, Math.min(left, viewport.width - tooltipRect.width - 8));
		top = Math.max(8, Math.min(top, viewport.height - tooltipRect.height - 8));

		tooltip.style.left = `${left}px`;
		tooltip.style.top = `${top}px`;

		// Point the arrow at the trigger even when the viewport clamp shifted the tooltip.
		setArrowLeft(`${Math.max(8, Math.min(triggerCenter - left, tooltipRect.width - 8))}px`);
	};

	// Handle force
	createEffect(() => {
		if (props.force) {
			setShow(true);
			requestAnimationFrame(updatePosition);
		} else if (props.force === false) {
			// When force becomes false, hide the tooltip
			setShow(false);
		}
	});

	return (
		// A plain wrapper, so the child stays the only focus stop and keeps its own role.
		// Focus events bubble up from the child as focusin/focusout.
		// biome-ignore lint/a11y/noStaticElementInteractions: the handlers only observe the interactive child
		<div
			class="relative inline-flex"
			ref={setTriggerEl}
			onMouseEnter={() => {
				if (!props.force) {
					setShow(true);
					// Use requestAnimationFrame to ensure tooltip is rendered before positioning
					requestAnimationFrame(updatePosition);
				}
			}}
			onMouseLeave={() => {
				if (!props.force) {
					setShow(false);
				}
			}}
			onFocusIn={() => {
				if (!props.force) {
					setShow(true);
					requestAnimationFrame(updatePosition);
				}
			}}
			onFocusOut={() => {
				if (!props.force) {
					setShow(false);
				}
			}}
		>
			{props.children}
			<Show when={show() || props.force}>
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
								left: arrowLeft(),
								top: props.position === "top" ? "100%" : "-4px",
								transform: "translateX(-50%)",
							}}
							classList={{
								// Tooltip above trigger: arrow points down from tooltip bottom
								"border-r border-b": props.position === "top",
								// Tooltip below trigger: arrow points up from tooltip top
								"border-l border-t": props.position === "bottom",
							}}
						/>
					</div>
				</Portal>
			</Show>
		</div>
	);
}
