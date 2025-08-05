import type { JSX } from "solid-js";
import Layout from "./layout/web";

export function About(): JSX.Element {
	return (
		<Layout>
			<p>
				I built <a href="https://hang.live">hang.live</a> because the internet forgot how to hang out.
			</p>
			<div class="flex flex-wrap justify-center gap-4 my-8">
				<img src="/avatar/1.svg" alt="Avatar" class="w-16 h-16 rounded-lg bg-gray-900 p-1 " />
				<img src="/avatar/5.svg" alt="Avatar" class="w-16 h-16 rounded-lg bg-gray-900 p-1 " />
				<img src="/avatar/3.svg" alt="Avatar" class="w-16 h-16 rounded-lg bg-gray-900 p-1 " />
				<img src="/avatar/7.svg" alt="Avatar" class="w-16 h-16 rounded-lg bg-gray-900 p-1 " />
				<img src="/avatar/9.svg" alt="Avatar" class="w-16 h-16 rounded-lg bg-gray-900 p-1 " />
			</div>
			<p>
				It's free. It's fun. <a href="/fave">Create a hang.</a> Invite your friends.
			</p>
		</Layout>
	);
}
