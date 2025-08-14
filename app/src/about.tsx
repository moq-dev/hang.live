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
		location: randomLocation(),
		user: { name: "Gargoyle Boy", avatar: "/avatar/41.svg" },
	});

	const five = room.create({
		location: randomLocation(),
		user: { name: "The Black Dot", avatar: "/avatar/40.svg" },
	});

	const six = room.create({
		location: randomLocation(),
		user: { name: "Oaf", avatar: "/avatar/39.svg" },
	});

	const seven = room.create({
		location: { x: 0.25, y: 0, scale: 1.5 },
	});

	// Every 2 seconds, perform the next action in the timeline.
	const timeline = [
		() => room.add("1", one),
		() => room.add("2", two),
		() => one.chat.message.set("sup"),
		() => two.chat.message.set("yo"),
		() => {},
		() => one.chat.message.set("how's life as a simulation?"),
		() => {},
		() => two.chat.message.set("okay I guess"),
		() => two.location.current.set((prev) => ({ ...prev, scale: 1.5 })),
		() => two.chat.message.set("mouse wheel or pinch to zoom"),
		() => two.location.current.set((prev) => ({ ...prev, scale: 0.75 })),
		() => two.location.current.set((prev) => ({ ...prev, scale: 1 })),
		() => two.chat.message.set("drag to move"),
		() => two.location.current.set(randomLocation()),
		() => {
			two.location.current.set(randomLocation());
			one.chat.message.set("try it!");
		},
		() => two.chat.message.set("you can even drag others"),
		() => one.location.current.set(randomLocation()),
		() => one.chat.message.set("sick"),
		() => room.add("3", three),
		() => {
			one.chat.message.set("hey");
			two.chat.message.set("sup");
		},
		() => three.chat.message.set("hello"),
		() => {},
		() => one.chat.message.set("try turning your webcam on"),
		() => {},
		() => two.user.set({ name: "omni-man", avatar: "/avatar/omni.jpg" }),
		() => two.chat.message.set("oops wrong button"),
		() => two.user.set({ name: "omni-man", avatar: "/avatar/43.svg" }),
		() => three.chat.message.set("dude"),
		() => two.play(new URL("/meme/linus.mp4", import.meta.url)),
		() => three.location.current.set(randomLocation()),
		() => three.chat.message.set("omg"),
		() => two.stop(),
		() => two.chat.message.set("on second thought, maybe not"),
		() => one.chat.message.set("lame"),
		() => two.location.current.set((prev) => ({ ...prev, scale: 1 })),
		() => three.chat.message.set("gotta run"),
		() => room.remove("3"),
		() => one.chat.message.set("k then"),
		() => {},
		() => one.chat.message.set("try typing /huh"),
		() => {},
		() => two.chat.message.set("/huh"),
		() => {},
		() => one.chat.message.set("that's right, I added dumb memes"),
		() => {},
		() => {},
		() => two.chat.message.set("huh?"),
		() => one.chat.message.set("inviting the squad"),
		() => two.chat.message.set("oh no"),
		() => room.add("4", four),
		() => room.add("5", five),
		() => four.chat.message.set("hey"),
		() => room.add("6", six),
		() => five.chat.message.set("yo"),
		() => six.chat.message.set("poop"),
		() => four.location.current.set(randomLocation()),
		() => two.location.current.set(randomLocation()),
		() => two.chat.message.set("good lord"),
		() => six.location.current.set(randomLocation()),
		() => {},
		() => six.chat.message.set("let's watch something"),
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
			two.chat.message.set("this shit again");
		},
		() => two.location.current.set(randomLeft()),
		() => {},
		() => {},
		() => {},
		() => {},
		() => room.remove("7"),
		() => {},
		() => one.chat.message.set("okay, that's enough of a demo"),
		() => room.remove("4"),
		() => room.remove("5"),
		() => room.remove("6"),
		() => one.chat.message.set("[start a hang](https://hang.live/fave)"),
		() => {},
		() => one.chat.message.set("there's a lot more, but it's hard to demo"),
		() => two.audio.captions.text.set("like automatic captions"),
		() => one.audio.captions.text.set("(laughing)"),
		() => two.chat.message.set("bye!"),
		() => room.remove("2"),
		() => one.chat.message.set("enjoy"),
		() => {},
		() => room.remove("1"),
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
			<div class="prose-invert lg:prose-lg">
				<p class="px-4">
					I built <a href="https://hang.live">hang.live</a> because the internet forgot how to hang out.
				</p>
				<p class="px-4">
					It's fun, free, and a little bit cringe. <a href="/fave">Start a hang</a> and invite your friends.
				</p>
				<div class="p-4 h-128">{canvas}</div>
				<p class="px-4">
					For the nerds in the audience, this site uses bleeding edge web technologies. We're using{" "}
					<a href="https://moq.dev">Media over QUIC</a> which is an{" "}
					<a href="https://github.com/kixelated/moq">open source</a> WebRTC alternative. This ain't your usual
					Zoom clone.
				</p>
			</div>
		</Layout>
	);
}
