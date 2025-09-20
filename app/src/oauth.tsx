import * as Router from "@solidjs/router";
import { createSignal, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { client } from "./api";
import Layout from "./layout/web";

export function Oauth(): JSX.Element {
	const [error, setError] = createSignal<string | undefined>(undefined);

	const navigate = Router.useNavigate();

	const params = Router.useParams();
	const redirect = params.redirect;

	const [searchParams, _] = Router.useSearchParams();
	const token = searchParams.token;
	const random = searchParams.random;

	if (!token) {
		setError("No token in OAuth callback");
	} else if (Array.isArray(token)) {
		setError("Multiple tokens in OAuth callback");
	} else if (!random) {
		setError("No random in OAuth callback");
	} else if (Array.isArray(random)) {
		setError("Multiple randoms in OAuth callback");
	} else {
		try {
			client.loginComplete(token, random);
			navigate(`/${redirect}`, { replace: true });
		} catch (error) {
			setError(error instanceof Error ? error.message : "Unknown error");
		}
	}

	// Remove the token and random from the URL.
	//setSearchParams({ token: undefined, random: undefined });

	return (
		<Layout>
			<Show when={error()} fallback={<div class="text-center">Logged in successfully!</div>}>
				<div class="text-red-500">{error()}</div>
			</Show>
		</Layout>
	);
}
