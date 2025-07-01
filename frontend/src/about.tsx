import type { JSX } from "solid-js";
import { Divider } from "./divider";

export function About(): JSX.Element {
	return (
		<>
			<Divider />
			<main>
				<p>
					I built <a href="https://hang.live">hang.live</a> because the internet forgot how to hang out.
				</p>
				<p>Unfortunately, you're going to have to wait a bit longer. It's not ready yet. Oops.</p>
				<p>
					In the meantime, <a href="https://discord.gg/SRG9gu6BdE">join the Discord</a> or{" "}
					<a href="/account">create an account</a>. You'll get a notification when the site is fit for human
					consumption.
				</p>
			</main>
		</>
	);
}
