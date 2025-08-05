import type { JSX } from "solid-js";
import Layout from "./layout/web";

export function NotFound(): JSX.Element {
	return (
		<Layout>
			<h1 class="text-4xl font-bold mb-4">404</h1>
			<p>Oops! This page doesn't exist.</p>
			<p>
				<a href="/" class="underline">
					Go back home
				</a>
			</p>
		</Layout>
	);
}
