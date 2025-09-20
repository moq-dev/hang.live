import { createSignal, For, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import * as Api from "../api";
import { unreachable } from "../util/unreachable";

export default function Login(props: { error?: string; small?: boolean }): JSX.Element {
	const [loading, setLoading] = createSignal(false);

	const getProviderIcon = (provider: Api.OAuth.ProviderId) => {
		switch (provider) {
			case "apple":
				return "icon-[mdi--apple]";
			case "google":
				return "icon-[mdi--google]";
			case "discord":
				return "icon-[mdi--discord]";
			default:
				unreachable(provider);
		}
	};

	const getProviderColor = (provider: Api.OAuth.ProviderId) => {
		switch (provider) {
			case "apple":
				return "bg-gray-600 hover:bg-gray-700";
			case "google":
				return "bg-red-600 hover:bg-red-700";
			case "discord":
				return "bg-blue-600 hover:bg-blue-700";
			default:
				unreachable(provider);
		}
	};

	const handleProviderLogin = async (provider: Api.OAuth.ProviderId) => {
		setLoading(true);
		try {
			await Api.client.loginStart(provider);
		} catch (error) {
			console.error("Login failed:", error);
			setLoading(false);
		}
	};

	return (
		<div
			class="flex flex-wrap gap-3 max-w-xs text-center justify-center mx-auto"
			classList={{ "flex-col": !props.small }}
		>
			{/* Error message */}
			<Show when={props.error}>
				<div class="bg-red-500/20 border border-red-400/30 rounded-2xl p-4 text-red-300 text-center">
					{props.error}
				</div>
			</Show>

			<For each={Api.oauthProviders}>
				{(provider) => (
					<button
						type="button"
						onClick={() => handleProviderLogin(provider)}
						disabled={loading()}
						class="flex items-center justify-center gap-3 p-4 text-white rounded-xl font-medium transition-all transform hover:scale-105 disabled:hover:scale-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer leading-none"
						classList={{
							[getProviderColor(provider)]: true,
						}}
					>
						<div
							style={{ filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.8))" }}
							class={getProviderIcon(provider)}
						/>
						<Show when={!props.small}>
							<span>{provider.charAt(0).toUpperCase() + provider.slice(1)}</span>
						</Show>
					</button>
				)}
			</For>
		</div>
	);
}
