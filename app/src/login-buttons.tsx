import * as Api from "@hang/api/client";
import { For } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconDiscord from "~icons/mdi/discord";
import IconGoogle from "~icons/mdi/google";
import { unreachable } from "./util";

export function LoginButtons(props: { api: Api.Client; message?: string }): JSX.Element {
	const getProviderIcon = (provider: Api.OAuth.ProviderId) => {
		switch (provider) {
			case "google":
				return <IconGoogle class="w-5 h-5" />;
			case "discord":
				return <IconDiscord class="w-5 h-5" />;
			default:
				unreachable(provider);
		}
	};

	const getProviderColor = (provider: Api.OAuth.ProviderId) => {
		switch (provider) {
			case "google":
				return "bg-red-600 hover:bg-red-700";
			case "discord":
				return "bg-blue-600 hover:bg-blue-700";
			default:
				unreachable(provider);
		}
	};

	const handleProviderLogin = (provider: Api.OAuth.ProviderId) => {
		props.api.login(provider);
	};

	return (
		<div class="text-center rounded-2xl border border-gray-800 p-6">
			<p class="text-gray-400 mb-4">{props.message || "Login to continue"}</p>
			<div class="space-y-3 max-w-xs mx-auto">
				<For each={Api.oauthProviders}>
					{(provider) => (
						<button
							type="button"
							onClick={() => handleProviderLogin(provider)}
							class="w-full flex items-center justify-center gap-3 px-4 py-3 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer"
							classList={{
								[getProviderColor(provider)]: true,
							}}
						>
							<div style={{ filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.8))" }}>
								{getProviderIcon(provider)}
							</div>
							<span class="capitalize">Login with {provider}</span>
						</button>
					)}
				</For>
			</div>
		</div>
	);
}
