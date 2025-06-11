import { Accessor, createMemo, createSignal, For, onMount } from "solid-js";
import { Room } from "./room";
import { Broadcast, ChatMessage } from "./broadcast";

import { Bounds, Vector } from "./geometry";

import "github-markdown-css/github-markdown-dark.css";

export function Chat(props: { room: Room }) {
	const [now, setNow] = createSignal(performance.now());
	const updateNow = () => {
		setNow(performance.now());
		requestAnimationFrame(updateNow);
	};
	updateNow();

	const viewport = createMemo(() => props.room.viewport.get().div(window.devicePixelRatio));

	return (
		<For each={Array.from(props.room.broadcasts.values())}>
			{(broadcast) => <Broadcaster broadcast={broadcast} now={now} viewport={viewport} />}
		</For>
	);
}

function Broadcaster({
	broadcast,
	now,
	viewport,
}: { broadcast: Broadcast; now: Accessor<number>; viewport: Accessor<Vector> }) {
	const bounds = createMemo(() => broadcast.bounds.get().div(window.devicePixelRatio));

	return (
		<For each={broadcast.messages.get()}>
			{(message, index) => (
				<Message index={index} message={message} bounds={bounds} now={now} viewport={viewport} />
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
		if (state() === "fade-out") return 24;
		return 0;
	};

	const scale = createMemo(() => {
		if (state() === "fade-in") return 1.2;
		return 1;
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

	const [width, setWidth] = createSignal(maxWidth());
	const [height, setHeight] = createSignal(maxHeight());

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
		return 8 + Math.sqrt(maxWidth() / 10);
	});

	return (
		<div
			ref={setBox}
			style={{
				position: "fixed",
				transition: "opacity 0.5s, transform 0.5s, text-shadow 0.5s",
				opacity: opacity(),
				"pointer-events": "none",
				transform: `translateY(${translate()}px) scale(${scale()})`,
				top: `${round(top())}px`,
				left: `${round(left())}px`,
				"max-width": `${round(maxWidth())}px`,
				"max-height": `${round(maxHeight())}px`,
				"text-align": "center",
				"box-sizing": "border-box",
			}}
		>
			<div
				style={{
					display: "inline-block",
					"backdrop-filter": "blur(4px)",
					"border-radius": "4px",
					"pointer-events": state() === "active" ? "auto" : "none",
					background: "rgba(0, 0, 0, 0.5)",
					color: "white",
					padding: "0 12px",
					"font-size": `${font()}px`,
				}}
				class="chat-message markdown-body"
				innerHTML={props.message.markdown}
			/>
		</div>
	);
}
