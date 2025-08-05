import * as Api from "@hang/api/client";
import { useNavigate } from "@solidjs/router";
import { createMemo, createResource, createSignal, For, Match, onMount, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconDelete from "~icons/mdi/delete";
import IconHeart from "~icons/mdi/heart";
import IconHeartOutline from "~icons/mdi/heart-outline";
import IconInformation from "~icons/mdi/information-outline";
import IconPlay from "~icons/mdi/play";
import IconPlus from "~icons/mdi/plus-box";
import Gradient from "./components/gradient";
import Login from "./components/login";
import { Layout } from "./layout";
import * as Random from "./util/random";

export function Fave(props: { api: Api.Client }): JSX.Element {
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

	const [favorites, { refetch }] = createResource(async () => {
		if (!props.api.authenticated()) return null;

		try {
			const response = await props.api.routes.fave.all.$get();
			if (response.ok) {
				const data = await response.json();
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

	const handleCreate = (e: Event) => {
		e.preventDefault();
		const name = roomName();
		if (name) {
			// Now actually navigate and add to history
			navigate(`/demo/${name}`);
		}
	};

	// Determine how many favorites to show initially
	const visibleFavorites = createMemo(() => {
		const favs = favorites() || [];
		if (showMore() || favs.length <= 6) {
			return favs;
		}
		return favs.slice(0, 6);
	});

	return (
		<Layout api={props.api}>
			<div class="max-w-7xl p-4">
				<div class="font-semibold mb-6 text-center text-gray-400">ready to hang?</div>

				{/* Two Column Layout */}
				<div class="flex flex-wrap gap-6 mb-8 items-start">
					<div class="flex-1 min-w-[300px] grow space-y-6">
						<div class="rounded-2xl border border-gray-800 p-6">
							<div class="flex items-center justify-between mb-8">
								<div class="flex items-center gap-2">
									<IconHeart class="w-5 h-5 text-red-500" />
									<h2 class="text-xl font-semibold">Favorites</h2>
								</div>
							</div>
							<Show
								when={props.api.authenticated()}
								fallback={
									<div class="text-center">
										<IconHeartOutline class="w-12 h-12 text-gray-500 mx-auto mb-4" />
										<h3 class="text-lg font-semibold mb-8">Sign in to favorite rooms</h3>
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
											<IconHeartOutline class="w-12 h-12 text-gray-500 mx-auto mb-4" />
											<h3 class="text-lg font-semibold mb-2">No favorites yet</h3>
											<p class="text-gray-400 text-sm leading-relaxed">
												Enjoying a hang? Click the heart icon to save it here and get
												notifications.
											</p>
										</div>
									</Match>
									<Match when={favorites()}>
										{(favs) => (
											<>
												<div class="space-y-3">
													<For each={visibleFavorites()}>
														{(favorite) => (
															<FavoriteRoom
																room={favorite.room}
																createdAt={favorite.created_at}
																onRemove={handleRemove}
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
															{showMore()
																? "Show less"
																: `Show ${favs().length - 6} more`}
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
									<IconPlus class="w-5 h-5 text-green-500" />
									<h2 class="text-xl font-semibold">Create</h2>
								</div>
							</div>

							<form onSubmit={handleCreate} class="space-y-4">
								<div class="flex gap-3">
									<input
										type="text"
										value={roomInput()}
										onInput={(e) => setRoomInput(e.currentTarget.value)}
										placeholder={placeholder()}
										class="flex-1 px-4 py-2 bg-gray-900/50 border border-gray-600 rounded-xl focus:outline-none focus:border-blue-500 transition-colors text-lg"
										autocomplete="off"
										autocorrect="off"
										autocapitalize="off"
										spellcheck={false}
									/>
									<button
										type="submit"
										class="px-3 py-2 rounded-xl font-medium transition-colors flex items-center gap-2 cursor-pointer"
										style={{
											background: Gradient(),
										}}
									>
										<IconPlay class="w-5 h-5" />
									</button>
								</div>

								{/* Live URL Preview */}
								<div class="text-sm text-gray-500">
									<span>Room URL: </span>
									<span class="text-gray-300 font-mono">hang.live/demo/{roomName()}</span>
								</div>
							</form>

							{/* Warning - Only shows when user types */}
							<Show when={roomInput().trim().length > 0}>
								<div class="mt-8 bg-amber-400/10 border border-amber-400 rounded-xl p-4">
									<div class="grid gap-3 grid-cols-[auto_1fr] justify-center items-center">
										<IconInformation class="w-4 h-4 inline-block text-amber-400" />
										<span class="text-amber-300 font-medium">Hangs are public</span>
										<span class="text-gray-400 col-start-2">
											Anybody that knows this name can join. Choose something unique if you want
											to keep strangers out.
										</span>
									</div>
								</div>
							</Show>
						</div>
					</div>
					;
				</div>
			</div>
		</Layout>
	);
}

function FavoriteRoom(props: { room: string; createdAt: number; onRemove: (room: string) => void }): JSX.Element {
	const [removing, setRemoving] = createSignal(false);

	const handleRemove = async (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setRemoving(true);
		props.onRemove(props.room);
	};

	return (
		<div
			class="group relative bg-gray-800/30 rounded-xl p-4 hover:bg-gray-800/50 transition-all flex items-center justify-between"
			classList={{
				"opacity-50 pointer-events-none": removing(),
			}}
		>
			<a href={`/demo/${props.room}`} class="flex-1 min-w-0 cursor-pointer">
				<h3 class="font-semibold text-lg truncate">{props.room}</h3>
			</a>
			<button
				type="button"
				onClick={handleRemove}
				class="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400 cursor-pointer ml-2"
				title="Remove from favorites"
			>
				<IconDelete class="w-4 h-4" />
			</button>
		</div>
	);
}
