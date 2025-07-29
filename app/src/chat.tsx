import solid from "@kixelated/signals/solid";
import { type Accessor, createMemo, createSignal, For, onMount } from "solid-js";
import type { Room } from "./room";
import type { Broadcast, ChatMessage } from "./room/broadcast";
import type { Bounds, Vector } from "./room/geometry";

import "github-markdown-css/github-markdown-dark.css";
import { Canvas } from "./canvas";

export function Chat(props: { canvas: Canvas; room: Room }) {
	const [now, setNow] = createSignal(performance.now());
	const updateNow = () => {
		setNow(performance.now());
		requestAnimationFrame(updateNow);
	};
	updateNow();

	const viewportUnscaled = solid(props.canvas.viewport);
	const viewport = createMemo(() => viewportUnscaled().div(window.devicePixelRatio));
	const broadcasts = solid(props.room.broadcasts);

	return (
		<For each={broadcasts()}>
			{(broadcast) => <Broadcaster broadcast={broadcast} now={now} viewport={viewport} />}
		</For>
	);
}

function Broadcaster(props: { broadcast: Broadcast; now: Accessor<number>; viewport: Accessor<Vector> }) {
	const boundsUnscaled = solid(props.broadcast.bounds);
	const bounds = createMemo(() => boundsUnscaled().div(window.devicePixelRatio));
	const messages = solid(props.broadcast.messages);

	return (
		<For each={messages()}>
			{(message, index) => (
				<Message index={index} message={message} bounds={bounds} now={props.now} viewport={props.viewport} />
			)}
		</For>
	);
}

function Message(props: {
	index: Accessor<number>;
	message: ChatMessage;
	bounds: Accessor<Bounds>;
	now: Accessor<number>;
	viewport: Accessor<Vector>;
}) {
	const round = (v: number) => Math.round(v * window.devicePixelRatio) / window.devicePixelRatio;

	const state = createMemo(() => {
		if (props.index() !== 0) return "fade-out";
		// Kind of a hack to make the first message fade in.
		if (props.now() < props.message.received + 100) return "fade-in";
		if (props.now() > props.message.expires - 1000) return "fade-out";
		return "active";
	});

	const opacity = createMemo(() => {
		if (state() === "fade-out") return 0;
		return 1;
	});

	const translate = () => {
		if (state() === "fade-out") return 16;
		return 0;
	};

	const scale = createMemo(() => {
		if (state() === "fade-in") return 1.2;
		return 1;
	});

	const zIndex = createMemo(() => {
		// Old messages are behind new messages.
		return 100 - props.index();
	});

	const [box, setBox] = createSignal<HTMLDivElement>();

	const maxWidth = createMemo(() => {
		const viewport = props.viewport();
		const bounds = props.bounds();
		return Math.min(viewport.x, Math.max(3 * bounds.size.x, 300));
	});

	const maxHeight = createMemo(() => {
		const viewport = props.viewport();
		const bounds = props.bounds();
		return Math.min(viewport.y, Math.max(3 * bounds.size.y, 300));
	});

	const [width, setWidth] = createSignal(0);
	const [height, setHeight] = createSignal(0);

	onMount(() => {
		const b = box();
		if (!b) throw new Error("box not found");
		setWidth(b.clientWidth);
		setHeight(b.clientHeight);
	});

	const top = createMemo(() => {
		const viewport = props.viewport();
		const bounds = props.bounds();
		return Math.min(viewport.y - height() - 40, bounds.position.y + bounds.size.y);
	});

	const left = createMemo(() => {
		const viewport = props.viewport();
		const bounds = props.bounds();
		return Math.min(Math.max(0, bounds.position.x + bounds.size.x / 2 - width() / 2), viewport.x - width());
	});

	// The font size increases slowly for large bounds.
	const font = createMemo(() => {
		return 12 + Math.sqrt(maxWidth() / 10);
	});

	return (
		<div
			ref={setBox}
			class="fixed transition-[opacity,transform] duration-1000 pointer-events-none text-center box-border"
			style={{
				opacity: opacity(),
				transform: `translateY(${translate()}px) scale(${scale()})`,
				top: `${round(top())}px`,
				left: `${round(left())}px`,
				"max-width": `${round(maxWidth())}px`,
				"max-height": `${round(maxHeight())}px`,
				"z-index": zIndex(),
			}}
		>
			<div
				class="inline-block backdrop-blur-sm rounded bg-black/50 text-white px-3 chat-message markdown-body"
				style={{
					"pointer-events": state() === "active" ? "auto" : "none",
					"font-size": `${font()}px`,
				}}
			>
				{props.message.element}
			</div>
		</div>
	);
}
/*
function Username(props: { broadcast: Accessor<Broadcast | undefined>; viewport: Accessor<Vector> }) {
	const round = (v: number) => Math.round(v * window.devicePixelRatio) / window.devicePixelRatio;
	const [linger, setLinger] = createSignal<Broadcast | undefined>(undefined);

	createEffect(() => {
		const broadcast = props.broadcast();
		// If no longer hovering, still linger instead of unsetting the name/bounds
		if (!broadcast) return;

		setLinger(broadcast);
	});

	const display = createMemo(() => linger()?.display.get() ?? "");
	const bounds = createMemo(
		() =>
			linger()?.bounds.get().div(window.devicePixelRatio) ?? new Bounds(Vector.create(0, 0), Vector.create(0, 0)),
	);

	const top = createMemo(() => {
		const viewport = props.viewport();
		return Math.max(0, bounds().position.y - 40);
	});

	const left = createMemo(() => {
		const viewport = props.viewport();
		return Math.min(Math.max(0, bounds().position.x + bounds().size.x / 2 - 100 / 2), viewport.x - 100);
	});

	return (
		<div
			style={{
				position: "fixed",
				transition: "opacity 0.5s, transform 0.5s",
				"pointer-events": props.broadcast() ? "auto" : "none",
				opacity: props.broadcast() ? 1 : 0,
				top: `${round(top())}px`,
				left: `${round(left())}px`,
				color: "white",
				"font-size": "24px",
			}}
		>
			{display()}
		</div>
	);
}
	*/
