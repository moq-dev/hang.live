import * as Api from "@hang/api/client";
import { createEffect, createMemo, createSignal, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import AnotherOne from "./components/another-one";
import Gradient from "./components/gradient";
import Login from "./components/login";
import Layout from "./layout/web";

export function Account(props: { api: Api.Client }): JSX.Element {
	return (
		<Layout>
			<Show when={props.api.authenticated()} fallback={<LoginPage api={props.api} />}>
				<SettingsLoad api={props.api} />
			</Show>
		</Layout>
	);
}

function SettingsLoad(props: { api: Api.Client }): JSX.Element {
	const [info, setInfo] = createSignal<Api.Account.Info | undefined>(undefined);
	const [error, setError] = createSignal<string | undefined>(undefined);

	const handleLogout = () => {
		props.api.logout();
	};

	onMount(async () => {
		try {
			const info = await props.api.routes.account.info.$get();
			if (info.ok) {
				setInfo(await info.json());
			} else {
				setError(info.statusText);
			}
		} catch (e) {
			setError(`Failed to load account info: ${e}`);
		}
	});

	return (
		<>
			<Switch>
				<Match when={error()}>
					<div class="bg-red-500/20 border border-red-400/30 rounded-2xl p-4 mb-6 text-red-300 text-center">
						Error: {error()}
					</div>
				</Match>
				<Match when={info()}>{(info) => <Settings api={props.api} info={info()} />}</Match>
				<Match when={true}>
					<div>Loading...</div>
				</Match>
			</Switch>

			{/* Full Width Sections */}
			<div class="space-y-6">
				{/* Action Buttons */}
				<div class="flex flex-col sm:flex-row gap-4 justify-between p-6">
					<button
						type="button"
						onClick={() => window.history.back()}
						class="px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer flex items-center"
					>
						<span class="icon-[mdi--arrow-left] w-4 h-4 mr-2" />
						Back
					</button>
					<button
						type="button"
						onClick={handleLogout}
						class="px-6 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer flex items-center"
					>
						Sign out
						<span class="icon-[mdi--logout] w-4 h-4 ml-2" />
					</button>
				</div>
			</div>
		</>
	);
}

function Settings(props: { api: Api.Client; info: Api.Account.Info }): JSX.Element {
	const [info, setInfo] = createSignal(props.info);
	const [name, setName] = createSignal<string | undefined>(props.info.name);
	const [avatar, setAvatar] = createSignal<File | string | undefined>(props.info.avatar);
	const [saving, setSaving] = createSignal(false);
	const [message, setMessage] = createSignal<{ type: "success" | "error"; text: string } | undefined>(undefined);
	const [randomClicks, setRandomClicks] = createSignal(0);

	const avatarChanged = createMemo(() => {
		return avatar() !== info().avatar;
	});

	const nameChanged = createMemo(() => {
		return name() !== info().name;
	});

	const changed = createMemo(() => {
		return nameChanged() || avatarChanged();
	});

	// Get the current avatar URL for display (either uploaded file preview or string URL)
	const currentAvatarUrl = createMemo(() => {
		const a = avatar();
		if (a instanceof File) {
			return URL.createObjectURL(a);
		}
		return a;
	});

	const handleBeforeUnload = (e: BeforeUnloadEvent) => {
		// Show the unsaved changes warning
		if (changed()) {
			e.preventDefault();
		}
	};

	window.addEventListener("beforeunload", handleBeforeUnload);
	onCleanup(() => {
		window.removeEventListener("beforeunload", handleBeforeUnload);
		// Clean up object URLs to prevent memory leaks
		const a = avatar();
		if (a instanceof File) {
			URL.revokeObjectURL(URL.createObjectURL(a));
		}
	});

	const handleAvatarUpload = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file) return;

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

		// Store the file for upload
		setAvatar(file);
	};

	const handleSaveChanges = async () => {
		setSaving(true);
		setMessage(undefined);

		try {
			// Make single request to the unified endpoint
			const response = await props.api.routes.account.info.$put({
				form: {
					name: name(),
					avatar: avatarChanged() ? avatar() : undefined,
				},
			});

			if (!response.ok) {
				throw new Error(response.statusText);
			}

			const info = await response.json();
			setInfo(info);
			setAvatar(info.avatar);
			setMessage({ type: "success", text: "Changes saved" });
		} catch (e) {
			setMessage({ type: "error", text: `Something went wrong. Try again? ${e}` });
		} finally {
			setSaving(false);
		}
	};

	const handleResetChanges = () => {
		setName(info().name);
		setAvatar(info().avatar);
	};

	const canSave = () => {
		return changed() && name()?.trim() !== "";
	};

	createEffect(() => {
		if (changed()) {
			setMessage(undefined);
		}
	});

	const handleRandomAvatar = () => {
		setRandomClicks((prev) => prev + 1);

		const old = info().avatar;

		while (true) {
			const randomUrl = Api.randomAvatar();
			if (randomUrl === old) continue;
			setAvatar(randomUrl);
			break;
		}
	};

	return (
		<>
			{/* Profile Section - Two Column Layout */}
			<div class="flex flex-wrap gap-6 mb-8 items-start">
				{/* Form Controls */}
				<div class="flex-1 min-w-[300px] grow space-y-6">
					{/* Avatar Section */}
					<div class="bg-gray-900/30 rounded-2xl p-6 border border-gray-800 w-full">
						<h3 class="text-xl font-semibold mb-4">Avatar</h3>
						<div class="space-y-4">
							<div class="flex flex-col gap-3">
								<div class="flex gap-2 relative">
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
												background: Gradient(),
												"text-shadow": "0 0 2px rgba(0, 0, 0, 0.8)",
											}}
										>
											<span
												class="icon-[mdi--upload] w-4 h-4"
												style={{ filter: "drop-shadow(0 0 1px rgba(0, 0, 0, 0.8))" }}
											/>
											{currentAvatarUrl() ? "Choose new avatar" : "Choose an avatar"}
										</span>
									</label>
									<Show when={currentAvatarUrl()}>
										<div class="relative">
											<button
												type="button"
												onClick={handleRandomAvatar}
												class="px-4 py-3 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer"
											>
												Random
											</button>

											<AnotherOne clicks={randomClicks} />
										</div>
									</Show>
								</div>
							</div>
							<p class="text-sm text-gray-400">Your friends will judge you, keep it clean.</p>
							<Show when={avatarChanged()}>
								<div class="text-sm text-yellow-400 flex items-center gap-2">
									<div class="w-2 h-2 bg-yellow-400 rounded-full" />
									Unsaved changes
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
								value={name()}
								onInput={(e) => {
									setName(e.currentTarget.value);
								}}
								placeholder="Enter your name"
								class="w-full px-4 py-3 bg-black/50 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 transition-all"
							/>
							<p class="text-sm text-gray-400">
								How you'll appear to others. You don't have to use a <i>real name</i>, mix it up.
							</p>
							<Show when={nameChanged()}>
								<div class="text-sm text-yellow-400 flex items-center gap-2">
									<div class="w-2 h-2 bg-yellow-400 rounded-full" />
									Unsaved changes
								</div>
							</Show>
						</div>
					</div>
				</div>

				{/* Preview Panel */}
				<div class="flex-1 min-w-[300px] grow bg-gray-900/30 rounded-2xl border border-gray-800 p-6 flex flex-col items-center justify-center">
					<h2 class="text-xl font-semibold mb-4 self-start">Preview</h2>

					{/* Avatar Preview with Name Overlay */}
					<div class="relative text-center">
						<div class="w-40 h-40 rounded-3xl overflow-hidden bg-gray-800 flex items-center justify-center border-8 border-black shadow-xl">
							<Show
								when={currentAvatarUrl()}
								fallback={<span class="icon-[mdi--camera] w-8 h-8 text-gray-400" />}
							>
								{(avatarUrl) => (
									<img src={avatarUrl()} alt="Avatar Preview" class="w-full h-full object-cover" />
								)}
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
								<Show when={!name()} fallback={name()}>
									<span class="text-gray-400">Your Name</span>
								</Show>
							</div>
						</div>

						{/* Change Indicator */}
						<Show when={changed()}>
							<div class="absolute -top-2 -right-2 w-6 h-6 bg-yellow-500 rounded-full border-2 border-black flex items-center justify-center">
								<div class="w-2 h-2 bg-black rounded-full" />
							</div>
						</Show>
					</div>

					{/* Save Changes Button - appears below preview when there are changes */}
					<div class="mt-6 w-full max-w-sm">
						<div
							class={`transition-all duration-500 ease-in-out overflow-hidden ${
								changed() ? "opacity-100 max-h-32" : "opacity-0 max-h-0"
							}`}
						>
							<div class="flex gap-2 p-2">
								<button
									type="button"
									onClick={handleSaveChanges}
									disabled={saving() || !canSave()}
									class="flex-1 px-4 py-3 text-white rounded-xl font-medium transition-all transform hover:scale-105 disabled:hover:scale-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
									style={{
										background: !saving() && canSave() ? Gradient() : "rgb(75, 85, 99)",
										"text-shadow": !saving() && canSave() ? "0 0 2px rgba(0, 0, 0, 0.8)" : "none",
									}}
								>
									<Show when={saving()} fallback="Save">
										<div class="flex items-center justify-center gap-2">
											<div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
											Saving...
										</div>
									</Show>
								</button>
								<button
									type="button"
									onClick={handleResetChanges}
									disabled={saving() || !changed()}
									class="px-4 py-3 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 text-white rounded-xl font-medium transition-all transform hover:scale-105 disabled:hover:scale-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
								>
									Reset
								</button>
							</div>
						</div>
					</div>

					{/* Message */}
					<Show when={message()}>
						<div
							class="rounded-2xl p-4 text-center mb-8 w-full"
							classList={{
								"bg-green-500/20 text-green-300 border border-green-400/30":
									message()?.type === "success",
								"bg-red-500/20 text-red-300 border border-red-400/30": message()?.type === "error",
							}}
						>
							{message()?.text}
						</div>
					</Show>
				</div>
			</div>
		</>
	);
}

export function LoginPage(props: { api: Api.Client }): JSX.Element {
	return (
		<main class="flex items-center justify-center">
			<div class="w-full max-w-md">
				{/* Title */}
				<div class="text-center mb-8">
					<div class="font-semibold mb-6 text-center text-gray-400">ready to join?</div>
				</div>

				{/* Login buttons */}
				<Login api={props.api} />
			</div>
		</main>
	);
}
