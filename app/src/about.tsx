import { createEffect, type JSX, onCleanup } from "solid-js";
import Layout from "./layout/web";
import { Canvas } from "./room/canvas";
import { FakeRoom } from "./room/fake";

export function About(): JSX.Element {
	const canvas = <canvas class="border-3 border-link-hue rounded-lg w-full h-full" />;

	const room = new FakeRoom(new Canvas(canvas as HTMLCanvasElement, { demo: true }));
	onCleanup(() => room.close());

	const random = () => (Math.random() > 0.5 ? -0.5 : 0.5) * (Math.random() * Math.random());
	const randomLocation = () => ({ x: random(), y: random() });
	const randomLeft = () => ({ x: -0.5 * Math.random() * Math.random(), y: random() });

	const one = room.create({
		location: randomLocation(),
		user: { name: "kixelated", avatar: "/avatar/kixel.svg" },
	});

	const two = room.create({
		location: randomLocation(),
		user: { name: "homie", avatar: "/avatar/43.svg" },
	});

	const three = room.create({
		location: randomLocation(),
		user: { name: "Chad", avatar: "/avatar/42.svg" },
	});

	const four = room.create({
		location: randomLeft(),
		user: { name: "Gargoyle Boy", avatar: "/avatar/41.svg" },
	});

	const five = room.create({
		location: randomLeft(),
		user: { name: "The Black Dot", avatar: "/avatar/40.svg" },
	});

	const six = room.create({
		location: randomLeft(),
		user: { name: "Oaf", avatar: "/avatar/39.svg" },
	});

	const seven = room.create({
		location: { x: 0.25, y: 0, scale: 1.5 },
	});

	// Every 2 seconds, perform the next action in the timeline.
	const timeline = [
		() => room.add("1", one),
		() => {
			room.add("2", two);
			one.chat.typing.active.set(true);
		},
		() => {
			one.chat.markdown.message.set("sup");
			two.chat.typing.active.set(true);
		},
		() => two.chat.markdown.message.set("yo"),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("how's life as a simulation?"),
		() => {},
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("okay I guess"),
		() => two.location.current.set((prev) => ({ ...prev, scale: 1.5 })),
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("mouse wheel or pinch to zoom"),
		() => two.location.current.set((prev) => ({ ...prev, scale: 0.75 })),
		() => two.location.current.set((prev) => ({ ...prev, scale: 1 })),
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("drag to move"),
		() => two.location.current.set(randomLocation()),
		() => {
			two.location.current.set(randomLocation());
			one.chat.typing.active.set(true);
			one.chat.markdown.message.set("try it!");
		},
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("you can even drag others"),
		() => one.location.current.set(randomLocation()),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("sick"),
		() => room.add("3", three),
		() => {
			one.chat.typing.active.set(true);
			two.chat.typing.active.set(true);
			one.chat.markdown.message.set("hey");
			two.chat.markdown.message.set("sup");
		},
		() => three.chat.typing.active.set(true),
		() => three.chat.markdown.message.set("hello"),
		() => {},
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("try turning your webcam on"),
		() => {},
		() => two.user.set({ name: "omni-chan", avatar: "/avatar/omni.jpg" }),
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("oops wrong button"),
		() => two.user.set({ name: "omni-chan", avatar: "/avatar/43.svg" }),
		() => three.chat.typing.active.set(true),
		() => three.chat.markdown.message.set("dude"),
		() => two.play(new URL("/meme/linus.mp4", import.meta.url)),
		() => three.location.current.set(randomLocation()),
		() => three.chat.typing.active.set(true),
		() => three.chat.markdown.message.set("omg"),
		() => {},
		() => {},
		() => two.stop(),
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("on second thought, maybe not"),
		() => {},
		() => three.chat.typing.active.set(true),
		() => three.chat.markdown.message.set("gotta run"),
		() => room.remove("3"),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("lame"),
		() => {},
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("try typing /huh"),
		() => {},
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("/huh"),
		() => two.location.current.set({ x: -0.5, y: 0 }),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("that's right, I added dumb memes"),
		() => two.location.current.set({ x: 0.5, y: 0 }),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("and audio panning"),
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("huh?"),
		() => {},
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("inviting the squad"),
		() => {
			two.chat.typing.active.set(true);
			two.chat.markdown.message.set("oh no");
			two.location.current.set(randomLocation());
		},
		() => room.add("4", four),
		() => room.add("5", five),
		() => four.chat.typing.active.set(true),
		() => four.chat.markdown.message.set("hey"),
		() => room.add("6", six),
		() => five.chat.typing.active.set(true),
		() => five.chat.markdown.message.set("yo"),
		() => six.chat.typing.active.set(true),
		() => six.chat.markdown.message.set("poop"),
		() => {},
		() => {},
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("good lord"),
		() => {},
		() => {},
		() => six.chat.typing.active.set(true),
		() => six.chat.markdown.message.set("let's watch something"),
		() => {
			room.add("7", seven);
			seven.play(new URL("/meme/bing-chilling.webm", import.meta.url));
		},
		() => {
			one.location.current.set(randomLeft());
			four.location.current.set(randomLeft());
			six.location.current.set(randomLeft());
		},
		() => {
			five.location.current.set(randomLeft());
			three.location.current.set(randomLeft());
			two.chat.typing.active.set(true);
			two.chat.markdown.message.set("this shit again");
		},
		() => two.location.current.set(randomLeft()),
		() => {},
		() => {},
		() => {},
		() => {},
		() => {},
		() => {},
		() => room.remove("7"),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("okay, that's enough of a demo"),
		() => room.remove("4"),
		() => room.remove("5"),
		() => room.remove("6"),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("there's a lot more, but it's hard to demo"),
		() => {},
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("[start a hang](https://hang.live/start)"),
		() => two.audio.captions.text.set("like automatic captions"),
		() => one.audio.captions.text.set("(laughing)"),
		() => two.chat.typing.active.set(true),
		() => two.chat.markdown.message.set("bye!"),
		() => room.remove("2"),
		() => one.chat.typing.active.set(true),
		() => one.chat.markdown.message.set("enjoy"),
		() => {},
		() => room.remove("1"),
	];

	createEffect(() => {
		const interval = setInterval(() => {
			const action = timeline.shift();
			if (action) action();
		}, 1500);

		onCleanup(() => clearInterval(interval));
	});

	return (
		<Layout>
			<div class="prose-invert lg:prose-lg">
				<p class="px-4">
					I built <a href="https://hang.live">hang.live</a> because the internet forgot how to hang out.
				</p>
				<p class="px-4">
					It's fun, free, and a bit cringe. <a href="/start">Start a hang</a> and invite your friends.
				</p>
				<div class="p-4 h-128">{canvas}</div>
				<p class="px-4">
					For the nerds in the audience, this site uses bleeding edge web technologies. We're using{" "}
					<a href="https://moq.dev">Media over QUIC</a>: an{" "}
					<a href="https://github.com/kixelated/moq">open source</a> WebRTC alternative. This ain't your usual
					Zoom clone.
				</p>
			</div>
		</Layout>
	);
}
