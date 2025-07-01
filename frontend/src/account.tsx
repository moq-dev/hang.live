import { For, Show, createSignal, onMount } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconDiscord from "~icons/mdi/discord";
import IconGithub from "~icons/mdi/github";
import IconGoogle from "~icons/mdi/google";
import IconLogin from "~icons/mdi/login";
import { type Provider, authService } from "./auth";

export function Login(): JSX.Element {
	const [providers, setProviders] = createSignal<Provider[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	onMount(async () => {
		try {
			const availableProviders = await authService.getProviders();
			setProviders(availableProviders);
		} catch (err) {
			console.error("Failed to initialize login:", err);
			setError("Failed to load login options. Please try again.");
		}
	});

	const getProviderIcon = (providerName: string) => {
		switch (providerName.toLowerCase()) {
			case "google":
				return <IconGoogle class="w-5 h-5" />;
			case "github":
				return <IconGithub class="w-5 h-5" />;
			case "discord":
				return <IconDiscord class="w-5 h-5" />;
			default:
				return <IconLogin class="w-5 h-5" />;
		}
	};

	const getProviderColor = (providerName: string) => {
		switch (providerName.toLowerCase()) {
			case "google":
				return "bg-red-600 hover:bg-red-700";
			case "github":
				return "bg-gray-800 hover:bg-gray-900";
			case "discord":
				return "bg-indigo-600 hover:bg-indigo-700";
			default:
				return "bg-blue-600 hover:bg-blue-700";
		}
	};

	const handleProviderLogin = (provider: Provider) => {
		setLoading(true);
		setError(null);
		authService.initiateOAuth(provider.name);
	};

	return (
		<main class="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 flex items-center justify-center p-4">
			<div class="bg-black/30 backdrop-blur-lg rounded-xl p-8 w-full max-w-md border border-white/10">
				<div class="text-center mb-8">
					<h1 class="text-4xl font-bold text-white mb-2">Welcome to Hang</h1>
					<p class="text-gray-300">Sign in to join the conversation</p>
				</div>

				<Show when={error()}>
					<div class="bg-red-500/20 border border-red-500/50 rounded-lg p-3 mb-6 text-red-200 text-sm">
						{error()}
					</div>
				</Show>

				<div class="space-y-3">
					<Show
						when={providers().length > 0}
						fallback={
							<div class="text-center py-8">
								<div class="animate-spin w-8 h-8 border-2 border-white/20 border-t-white rounded-full mx-auto mb-4" />
								<p class="text-gray-400">Loading login options...</p>
							</div>
						}
					>
						<For each={providers()}>
							{(provider) => (
								<button
									type="button"
									onClick={() => handleProviderLogin(provider)}
									disabled={loading()}
									class={`w-full flex items-center justify-center gap-3 px-4 py-3 rounded-lg text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed ${getProviderColor(
										provider.name,
									)}`}
								>
									{getProviderIcon(provider.name)}
									<span class="capitalize">Continue with {provider.name}</span>
								</button>
							)}
						</For>
					</Show>
				</div>

				<div class="mt-8 pt-6 border-t border-white/10">
					<p class="text-xs text-gray-400 text-center">
						By signing in, you agree to our terms of service and privacy policy.
					</p>
				</div>

				<div class="mt-4 text-center">
					<a href="/" class="text-sm text-gray-400 hover:text-white transition-colors">
						← Back to home
					</a>
				</div>
			</div>
		</main>
	);
}
