import * as Api from "@hang/api/client";
import { Connection } from "@kixelated/hang";
import { useNavigate } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import Dialog from "./components/dialog";
import Gradient from "./components/gradient";
import Login from "./components/login";
import Layout from "./layout/web";
import { PreviewRoomCompact } from "./preview";
import * as Random from "./util/random";

export function Start(props: { api: Api.Client }): JSX.Element {
	const navigate = useNavigate();
	const [roomInput, setRoomInput] = createSignal("");
	const [placeholder, setPlaceholder] = createSignal(Random.room());
	const [showMore, setShowMore] = createSignal(false);

	// Regenerate placeholder periodically
	onMount(() => {
		const interval = setInterval(() => {
			if (!roomInput()) {
				setPlaceholder(Random.room());
			}
		}, 5000);
		return () => clearInterval(interval);
	});

	// Connection for live previews
	const connection = new Connection();
	onCleanup(() => connection.close());

	const [favorites, { refetch }] = createResource(async () => {
		if (!props.api.authenticated()) return null;

		try {
			const response = await props.api.routes.fave.all.$get();
			if (response.ok) {
				const data = await response.json();
				connection.url.set(new URL(data.token));
				return data.favorites;
			}
		} catch (error) {
			console.error("Failed to fetch favorites:", error);
		}
		return null;
	});

	const handleRemove = async (room: string) => {
		try {
			const response = await props.api.routes.fave[":room"].remove.$post({
				param: { room },
			});
			if (response.ok) {
				refetch();
			}
		} catch (error) {
			console.error("Failed to remove favorite:", error);
		}
	};

	const roomName = createMemo(() => {
		const input = roomInput().trim();
		return input || placeholder();
	});

	const roomNameError = createMemo(() => {
		const name = roomInput().trim();
		if (!name) return null;

		if (!Api.Room.isValidName(name)) {
			return Api.Room.ROOM_NAME_ERROR;
		}
		return null;
	});

	const handleCreate = (e: Event) => {
		e.preventDefault();
		const name = roomName();
		if (name && Api.Room.isValidName(name)) {
			// Now actually navigate and add to history
			navigate(`/@${name}`);
		}
	};

	return (
		<Layout>
			<div class="font-semibold mb-6 text-center text-gray-400">ready to hang?</div>

			{/* Two Column Layout */}
			<div class="flex flex-wrap gap-6 mb-8 items-start">
				<div class="flex-1 min-w-[300px] grow space-y-6">
					<div class="rounded-2xl border border-gray-800 p-6">
						<div class="flex items-center justify-between mb-8">
							<div class="flex items-center gap-2">
								<span class="icon-[mdi--heart] text-red-500" />
								<h2 class="text-xl font-semibold">Favorites</h2>
							</div>
						</div>
						<Show
							when={props.api.authenticated()}
							fallback={
								<div class="text-center">
									<span class="icon-[mdi--heart-outline] w-12 h-12 text-gray-500 mx-auto mb-4" />
									<h3 class="text-lg font-semibold mb-8">Sign in to favorite hangs</h3>
									<Login api={props.api} />
								</div>
							}
						>
							<Switch>
								<Match when={favorites.loading}>
									<div class="space-y-3">
										<For each={[1, 2, 3]}>
											{() => (
												<div class="bg-gray-800/30 rounded-xl p-4 animate-pulse">
													<div class="h-5 bg-gray-700 rounded mb-2 w-3/4" />
													<div class="h-4 bg-gray-700 rounded w-1/2" />
												</div>
											)}
										</For>
									</div>
								</Match>
								<Match when={favorites()?.length === 0}>
									<div class="text-center py-8">
										<span class="icon-[mdi--heart-outline] w-12 h-12 text-gray-500 mx-auto mb-4" />
										<h3 class="text-lg font-semibold mb-2">No favorites yet</h3>
										<p class="text-gray-400 text-sm leading-relaxed">
											Enjoyed yourself? Click the heart icon to save a hang and (eventually) get
											notifications when others join.
										</p>
									</div>
								</Match>
								<Match when={favorites()}>
									{(favs) => (
										<>
											<div class="space-y-3">
												<For each={favs()}>
													{(favorite) => (
														<FavoriteRoom
															room={favorite.room}
															createdAt={favorite.created_at}
															onRemove={handleRemove}
															connection={connection}
															api={props.api}
														/>
													)}
												</For>
											</div>
											<Show when={favs().length > 6}>
												<div class="mt-4 text-center">
													<button
														type="button"
														onClick={() => setShowMore(!showMore())}
														class="text-sm text-blue-400 hover:text-blue-300 transition-colors"
													>
														{showMore() ? "Show less" : `Show ${favs().length - 6} more`}
													</button>
												</div>
											</Show>
										</>
									)}
								</Match>
							</Switch>
						</Show>
					</div>
				</div>
				<div class="flex-1 min-w-[300px] grow space-y-6">
					<div class="rounded-2xl border border-gray-800 p-6">
						<div class="flex items-center justify-between mb-8">
							<div class="flex items-center gap-2">
								<span class="icon-[mdi--plus-box] text-green-500" />
								<h2 class="text-xl font-semibold">Create</h2>
							</div>
						</div>

						<form onSubmit={handleCreate} class="space-y-4">
							<div class="flex gap-3">
								<div
									class="flex-1 flex items-center bg-gray-900/50 border rounded-xl transition-colors text-lg overflow-hidden"
									classList={{
										"border-red-500": !!roomNameError(),
										"border-gray-600": !roomNameError() && !roomInput(),
										"focus-within:border-link-hue": !roomNameError() && !!roomInput(),
										"border-link-hue": !roomNameError() && !!roomInput(),
									}}
								>
									<span class="pl-4 text-gray-500 select-none">@</span>
									<input
										type="text"
										value={roomInput()}
										onInput={(e) => setRoomInput(e.currentTarget.value)}
										placeholder={placeholder()}
										class="flex-1 px-2 py-2 bg-transparent focus:outline-none"
										autocomplete="off"
										autocorrect="off"
										autocapitalize="off"
										spellcheck={false}
									/>
								</div>
								<button
									type="submit"
									class="px-3 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
									classList={{
										"opacity-50 cursor-not-allowed": !!roomNameError(),
										"cursor-pointer": !roomNameError(),
									}}
									style={{
										background: Gradient(),
									}}
									disabled={!!roomNameError()}
								>
									<span class="icon-[mdi--play]" />
								</button>
							</div>

							{/* Live URL Preview */}
							<div class="text-md">
								<span class="text-gray-300">URL: </span>
								<a href={`https://hang.live/@${roomName()}`} target="_blank" rel="noopener noreferrer">
									hang.live/@{roomName()}
								</a>
							</div>
						</form>

						{/* Validation Error */}
						<Show when={roomNameError()}>
							{(error) => (
								<Dialog
									icon="icon-[mdi--alert-circle-outline]"
									title="Invalid room name"
									description={error()}
									variant="error"
								/>
							)}
						</Show>

						<Dialog
							icon="icon-[mdi--information-outline]"
							title="Hangs are public"
							description="Anybody with this URL can join. Choose something unique if you want to keep strangers out."
						/>
					</div>
				</div>
			</div>
		</Layout>
	);
}

function FavoriteRoom(props: {
	room: string;
	createdAt: number;
	onRemove: (room: string) => void;
	connection: Connection;
	api: Api.Client;
}): JSX.Element {
	const [removing, setRemoving] = createSignal(false);
	const [memberCount, setMemberCount] = createSignal(0);

	const handleRemove = async (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setRemoving(true);
		props.onRemove(props.room);
	};

	return (
		<div
			class="group relative bg-gray-800/30 rounded-xl px-5 py-3 hover:bg-gray-800/50 transition-all flex flex-col gap-3"
			classList={{
				"opacity-50 pointer-events-none": removing(),
			}}
		>
			<div class="flex items-center justify-between">
				<a href={`/@${props.room}`} class="flex-1 min-w-0 truncate cursor-pointer">
					<h3 class="font-semibold text-lg truncate">{props.room}</h3>
				</a>
				<div class="relative flex items-center">
					<Show when={memberCount() > 0}>
						<span class="text-gray-400 font-semibold absolute inset-0 flex items-center justify-center group-hover:opacity-0 transition-opacity">
							{memberCount()}
						</span>
					</Show>
					<button
						type="button"
						onClick={handleRemove}
						class="opacity-0 group-hover:opacity-100 relative z-10 transition-all p-1 bg-gray-800 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400 cursor-pointer"
						title="Remove from favorites"
					>
						<span class="icon-[mdi--delete] w-4 h-4" />
					</button>
				</div>
			</div>
			<PreviewRoomCompact connection={props.connection} api={props.api} onMemberCountChange={setMemberCount} />
		</div>
	);
}
