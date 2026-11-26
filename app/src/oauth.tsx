import * as Router from "@solidjs/router";
import { createSignal, onMount, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { client } from "./api";
import Layout from "./layout/web";

export function Oauth(): JSX.Element {
	const [error, setError] = createSignal<string | undefined>(undefined);
	const [done, setDone] = createSignal(false);

	const navigate = Router.useNavigate();

	const params = Router.useParams();
	const redirect = params.redirect;

	const [searchParams, _] = Router.useSearchParams();
	const code = searchParams.code;

	const complete = async () => {
		if (!code) {
			setError("No code in OAuth callback");
			return;
		}
		if (Array.isArray(code)) {
			setError("Multiple codes in OAuth callback");
			return;
		}

		try {
			await client.loginComplete(code);
			setDone(true);
			// Replacing the entry also drops the code from history.
			navigate(`/${redirect}`, { replace: true });
		} catch (error) {
			setError(error instanceof Error ? error.message : "Unknown error");
		}
	};
	onMount(() => void complete());

	return (
		<Layout>
			<Show
				when={error()}
				fallback={<div class="text-center">{done() ? "Logged in successfully!" : "Logging in…"}</div>}
			>
				<div class="text-red-500">{error()}</div>
			</Show>
		</Layout>
	);
}
