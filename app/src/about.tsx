import { createEffect, type JSX, onCleanup } from "solid-js";
import Layout from "./layout/web";
import { Canvas } from "./room/canvas";
import { FakeBroadcast, FakeRoom } from "./room/fake";

export function About(): JSX.Element {
	const canvas = <canvas class="w-full" />;

	const room = new FakeRoom(new Canvas(canvas as HTMLCanvasElement, { background: false }));
	onCleanup(() => room.close());

	const random = () => (Math.random() * 2 - 1) * 0.9;

	const one = new FakeBroadcast({
		location: { x: random(), y: random() },
		user: { name: "kixelated", avatar: "/avatar/kixel.svg" },
	});
	const two = new FakeBroadcast({ location: { x: random(), y: random() } });
	const three = new FakeBroadcast({ location: { x: random(), y: random() } });

	// Every 2 seconds, perform the next action in the timeline.
	const timeline = [
		() => room.add("1", one),
		() => room.add("2", two),
		() => one.chat.message.set("sup"),
		() => two.chat.message.set("yo"),
		() => one.location.current.set({ x: random(), y: random() }),
		() => one.chat.message.set("how's life as a simulation?"),
		() => {},
		() => two.chat.message.set("okay I guess"),
		() => two.location.current.set((prev) => ({ ...prev, scale: 2 })),
		() => two.chat.message.set("mouse wheel to zoom"),
		() => two.location.current.set((prev) => ({ ...prev, scale: 0.5 })),
		() => two.location.current.set((prev) => ({ ...prev, scale: 1 })),
		() => two.chat.message.set("drag to move"),
		() => two.location.current.set({ x: random(), y: random() }),
		() => two.location.current.set({ x: random(), y: random() }),
		() => two.chat.message.set("you can even drag others"),
		() => one.location.current.set({ x: random(), y: random() }),
		() => one.chat.message.set("sick"),
		() => room.add("3", three),
		() => {
			one.chat.message.set("hey");
			two.chat.message.set("sup");
		},
		() => three.chat.message.set("hello"),
	];

	createEffect(() => {
		const interval = setInterval(() => {
			const action = timeline.shift();
			if (action) action();
		}, 2000);

		onCleanup(() => clearInterval(interval));
	});

	return (
		<Layout>
			<p>
				I built <a href="https://hang.live">hang.live</a> because the internet forgot how to hang out.
			</p>
			<p>
				It's fun and free. <a href="/fave">Start a hang</a>. Invite your friends.
			</p>
			{canvas}
		</Layout>
	);
}
