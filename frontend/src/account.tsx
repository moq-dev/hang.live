import solid from "@kixelated/signals/solid";
import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconCamera from "~icons/mdi/camera";
import IconDiscord from "~icons/mdi/discord";
import IconGithub from "~icons/mdi/github";
import IconGoogle from "~icons/mdi/google";
import IconLogin from "~icons/mdi/login";
import IconUpload from "~icons/mdi/upload";
import { Auth } from "./auth";
import { Divider } from "./divider";
import { useAnimatedGradient } from "./gradient";

export function Account(props: { auth: Auth }): JSX.Element {
	const authenticated = solid(props.auth.authenticated);

	return (
		<>
			<Divider />
			<Show when={authenticated()} fallback={<Login auth={props.auth} />}>
				<Settings auth={props.auth} />
			</Show>
		</>
	);
}

function Settings(props: { auth: Auth }): JSX.Element {
	const user = solid(props.auth.user);
	const [displayName, setDisplayName] = createSignal(user()?.name || "");
	const [avatarFile, setAvatarFile] = createSignal<File | null>(null);
	const [avatarPreview, setAvatarPreview] = createSignal<string | null>(null);
	const [avatarDeleted, setAvatarDeleted] = createSignal(false);
	const [isSaving, setIsSaving] = createSignal(false);
	const [message, setMessage] = createSignal<{ type: "success" | "error"; text: string } | null>(null);

	const gradient = useAnimatedGradient();

	// Update display name when user changes
	const currentUser = user();
	if (currentUser?.name && displayName() !== currentUser.name) {
		setDisplayName(currentUser.name);
	}

	const handleBeforeUnload = (e: BeforeUnloadEvent) => {
		// Show the unsaved changes warning
		if (hasChanges()) {
			e.preventDefault();
		}
	};

	window.addEventListener("beforeunload", handleBeforeUnload);
	onCleanup(() => window.removeEventListener("beforeunload", handleBeforeUnload));

	const handleAvatarUpload = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (file) {
			// Validate file type
			if (!file.type.startsWith("image/")) {
				setMessage({ type: "error", text: "Please select an image file" });
				return;
			}

			// Validate file size (max 5MB)
			if (file.size > 5 * 1024 * 1024) {
				setMessage({ type: "error", text: "Image must be smaller than 5MB" });
				return;
			}

			setAvatarFile(file);
			setAvatarDeleted(false); // Reset deleted state when new file is uploaded

			// Create preview
			const reader = new FileReader();
			reader.onload = (e) => {
				setAvatarPreview(e.target?.result as string);
			};
			reader.readAsDataURL(file);
			setMessage(null);
		}
	};

	const handleDeleteAvatar = () => {
		setAvatarDeleted(true);
		setAvatarFile(null);
		setAvatarPreview(null);
		setMessage(null);
	};

	const handleSaveChanges = async () => {
		setIsSaving(true);
		setMessage(null);

		try {
			// Here you would implement the actual save logic
			// For now, just simulate a save operation
			await new Promise((resolve) => setTimeout(resolve, 1000));

			// TODO: Implement actual API calls to:
			// 1. Upload avatar if avatarFile() exists
			// 2. Delete avatar if avatarDeleted() is true
			// 3. Update display name if changed
			// 4. Update the auth user state

			setMessage({ type: "success", text: "Changes saved" });
			setAvatarFile(null);
			setAvatarPreview(null);
			setAvatarDeleted(false);
		} catch {
			setMessage({ type: "error", text: "Something went wrong. Try again?" });
		} finally {
			setIsSaving(false);
		}
	};

	const handleResetChanges = () => {
		setDisplayName(user()?.name || "");
		setAvatarFile(null);
		setAvatarPreview(null);
		setAvatarDeleted(false);
		setMessage(null);
	};

	const handleLogout = () => {
		// TODO: Implement actual logout logic
		props.auth.logout?.();
	};

	const hasChanges = () => {
		return displayName() !== user()?.name || avatarFile() !== null || avatarDeleted();
	};

	const canSave = () => {
		return hasChanges() && displayName().trim() !== "";
	};

	return (
		<div class="min-h-screen bg-black text-white">
			<div class="max-w-7xl mx-auto p-4">
				{/* Header */}
				<div class="mb-8">
					<h1 class="text-3xl font-bold">Account Settings</h1>
					<p class="text-gray-400 mt-2">It's super limited right now. I'm working on it!</p>
				</div>

				{/* Message */}
				<Show when={message()}>
					<div
						class={`rounded-2xl p-4 text-center mb-8 max-w-2xl ${
							message()?.type === "success"
								? "bg-green-500/20 text-green-300 border border-green-400/30"
								: "bg-red-500/20 text-red-300 border border-red-400/30"
						}`}
					>
						{message()?.text}
					</div>
				</Show>

				{/* Profile Section - Two Column Layout */}
				<div class="flex flex-wrap gap-6 mb-8 items-start">
					{/* Preview Panel */}
					<div class="flex-1 min-w-[300px] grow bg-gray-900/30 rounded-2xl border border-gray-800 p-6 flex flex-col items-center justify-center">
						<h2 class="text-xl font-semibold mb-4 self-start">Preview</h2>

						{/* Avatar Preview with Name Overlay */}
						<div class="relative text-center">
							<div class="w-40 h-40 rounded-3xl overflow-hidden bg-gray-800 flex items-center justify-center border-8 border-black shadow-xl">
								<Show
									when={avatarPreview() || (!avatarDeleted() && user()?.avatar_url)}
									fallback={<IconCamera class="w-8 h-8 text-gray-400" />}
								>
									<img
										src={avatarPreview() || user()?.avatar_url}
										alt="Avatar Preview"
										class="w-full h-full object-cover"
									/>
								</Show>
							</div>

							{/* Display Name Overlay - Top Left Corner */}
							<div class="absolute top-2 left-2 bg-black/70 backdrop-blur-sm rounded-r-lg rounded-b-lg px-3 py-1 max-w-[calc(100%-1rem)]">
								<div
									class="text-sm font-bold truncate"
									style={{
										color: "white",
										"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
									}}
								>
									{displayName() || "Your Name"}
								</div>
							</div>

							{/* Change Indicator */}
							<Show when={avatarFile() || avatarDeleted()}>
								<div class="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full border-2 border-black flex items-center justify-center">
									<div class="w-2 h-2 bg-white rounded-full" />
								</div>
							</Show>
						</div>

						{/* Save Changes Button - appears below preview when there are changes */}
						<div class="mt-6 w-full max-w-sm">
							<div
								class={`transition-all duration-500 ease-in-out overflow-hidden ${
									hasChanges() ? "opacity-100 max-h-32" : "opacity-0 max-h-0"
								}`}
							>
								<div class="flex gap-2 p-2">
									<button
										type="button"
										onClick={handleSaveChanges}
										disabled={isSaving() || !canSave()}
										class="flex-1 px-4 py-3 text-white rounded-xl font-medium transition-all transform hover:scale-105 disabled:hover:scale-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
										style={{
											background:
												!isSaving() && canSave() ? gradient.linear() : "rgb(75, 85, 99)",
											"text-shadow":
												!isSaving() && canSave() ? "0 0 2px rgba(0, 0, 0, 0.8)" : "none",
										}}
									>
										<Show when={isSaving()} fallback="Save">
											<div class="flex items-center justify-center gap-2">
												<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
												Saving...
											</div>
										</Show>
									</button>
									<button
										type="button"
										onClick={handleResetChanges}
										disabled={isSaving() || !hasChanges()}
										class="px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-xl font-medium transition-all transform hover:scale-105 disabled:hover:scale-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
									>
										Reset
									</button>
								</div>
							</div>
						</div>
					</div>

					{/* Form Controls */}
					<div class="flex-1 min-w-[300px] grow space-y-6">
						{/* Avatar Section */}
						<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800 w-full">
							<h3 class="text-xl font-semibold mb-4">Avatar</h3>
							<div class="space-y-4">
								<div class="flex flex-col gap-3">
									<div class="flex gap-2">
										<label class="flex-1">
											<input
												type="file"
												accept="image/*"
												onChange={handleAvatarUpload}
												class="hidden"
											/>
											<span
												class="inline-flex items-center gap-2 px-6 py-3 text-white rounded-xl cursor-pointer transition-all transform hover:scale-105 font-medium w-full justify-center"
												style={{
													background: gradient.linear(),
													"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
												}}
											>
												<IconUpload
													class="w-4 h-4"
													style={{ filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.8))" }}
												/>
												{user()?.avatar_url && !avatarDeleted()
													? "Choose new avatar"
													: "Choose an avatar"}
											</span>
										</label>
										<Show when={avatarFile()}>
											<button
												type="button"
												onClick={() => {
													setAvatarFile(null);
													setAvatarPreview(null);
													setMessage(null);
												}}
												class="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer"
											>
												Remove
											</button>
										</Show>
									</div>
									<Show when={user()?.avatar_url && !avatarDeleted()}>
										<button
											type="button"
											onClick={handleDeleteAvatar}
											class="self-start px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-all transform hover:scale-105 text-sm cursor-pointer"
										>
											Delete current avatar
										</button>
									</Show>
								</div>
								<p class="text-sm text-gray-400">
									JPG, PNG, or GIF • Max 5MB
									<br />
									Your friends will judge you for any lewd images.
								</p>
								<Show when={avatarFile()}>
									<div class="text-sm text-green-400 flex items-center gap-2">
										<div class="w-2 h-2 bg-green-400 rounded-full" />
										New avatar ready to save
									</div>
								</Show>
								<Show when={avatarDeleted()}>
									<div class="text-sm text-red-400 flex items-center gap-2">
										<div class="w-2 h-2 bg-red-400 rounded-full" />
										Avatar will be deleted
									</div>
								</Show>
							</div>
						</div>

						{/* Display Name Section */}
						<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800">
							<h3 class="text-xl font-semibold mb-4">Display name</h3>
							<div class="space-y-3">
								<input
									type="text"
									value={displayName()}
									onInput={(e) => setDisplayName(e.currentTarget.value)}
									placeholder="Enter your name"
									class="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
								/>
								<p class="text-sm text-gray-400">
									How you'll appear to others. You don't have to use a <i>real name</i>, mix it up.
								</p>
								<Show when={displayName() !== user()?.name && displayName().trim() !== ""}>
									<div class="text-sm text-green-400 flex items-center gap-2">
										<div class="w-2 h-2 bg-green-400 rounded-full" />
										Display name changed
									</div>
								</Show>
							</div>
						</div>
					</div>
				</div>

				{/* Full Width Sections */}
				<div class="space-y-6">
					{/* Action Buttons - Only logout now */}
					<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800">
						<div class="flex flex-col sm:flex-row gap-4 max-w-2xl">
							<button
								type="button"
								onClick={handleLogout}
								class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer"
							>
								Sign out
							</button>
						</div>
					</div>

					{/* Back to App */}
					<div class="text-center py-4">
						<a href="/" class="text-gray-400 hover:text-white transition-colors">
							← Back to hang
						</a>
					</div>
				</div>
			</div>
		</div>
	);
}

export function Login(props: { auth: Auth }): JSX.Element {
	const [providers, setProviders] = createSignal<string[]>([]);
	const [loading, setLoading] = createSignal(false);
	const [error, setError] = createSignal<string | null>(null);

	const gradient = useAnimatedGradient();

	onMount(async () => {
		try {
			const availableProviders = await props.auth.providers();
			setProviders(availableProviders);
		} catch (err) {
			console.error("Failed to initialize login:", err);
			setError("Something went wrong. Try refreshing?");
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

	const handleProviderLogin = (provider: string) => {
		setLoading(true);
		setError(null);
		props.auth.login(provider);
	};

	return (
		<main class="min-h-screen bg-black text-white flex items-center justify-center p-4">
			<div class="w-full max-w-md">
				{/* Title */}
				<div class="text-center mb-12">
					<h1 class="text-6xl font-bold mb-4 text-white">Hang</h1>
					<p class="text-xl text-gray-400">ready to join?</p>
				</div>

				{/* Error message */}
				<Show when={error()}>
					<div class="bg-red-500/20 border border-red-400/30 rounded-2xl p-4 mb-6 text-red-300 text-center">
						{error()}
					</div>
				</Show>

				{/* Login buttons */}
				<div class="space-y-4">
					<Show
						when={providers().length > 0}
						fallback={
							<div class="text-center py-12">
								<div class="w-8 h-8 border-2 border-gray-700 border-t-white rounded-full mx-auto mb-4 animate-spin" />
								<p class="text-gray-400">Loading...</p>
							</div>
						}
					>
						<For each={providers()}>
							{(provider) => (
								<button
									type="button"
									onClick={() => handleProviderLogin(provider)}
									disabled={loading()}
									class="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl text-white font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 disabled:hover:scale-100 cursor-pointer"
									style={{
										background: gradient.linear(),
										"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
									}}
								>
									<div style={{ filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.8))" }}>
										{getProviderIcon(provider)}
									</div>
									<span class="capitalize">Continue with {provider}</span>
								</button>
							)}
						</For>
					</Show>
				</div>

				{/* Footer */}
				<div class="mt-12 text-center space-y-4">
					<p class="text-sm text-gray-500">By signing in, you agree to our terms and privacy policy</p>
					<a href="/" class="text-gray-400 hover:text-white transition-colors">
						← Browse without signing in
					</a>
				</div>
			</div>
		</main>
	);
}
