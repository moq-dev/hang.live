import * as Moq from "@moq/net";
import { Signal } from "@moq/signals";
import { createEffect, createSignal, For, Match, onCleanup, Show, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import * as Api from "./api";
import { Badge } from "./components/badge";
import CreateHang from "./components/create";
import Login from "./components/login";
import Profile from "./components/profile";
import Layout from "./layout/web";
import { PreviewRoomCompact } from "./preview";
import * as Relay from "./relay";
import { Local } from "./room/local";
import { solid } from "./util/solid";

export function Home(): JSX.Element {
	const [showMore, setShowMore] = createSignal(false);

	// Connection for live previews, its token renewed by fetching the favorites again.
	const tokens = new Signal<readonly string[]>([]);
	const connection = new Moq.Connection({ enabled: true, tokens });
	onCleanup(() => connection.close());

	// Track total member count across all favorites
	const badge = new Badge();
	badge.set(0);
	onCleanup(() => badge.close());

	const local = new Local();
	onCleanup(() => local.close());

	const authenticated = solid(Api.client.authenticated);

	// Undefined while loading, and null when signed out.
	const [favorites, setFavorites] = createSignal<Api.Fave.Info[] | null>();
	const [reload, setReload] = createSignal(0);

	createEffect(() => {
		reload();
		if (!authenticated()) {
			setFavorites(null);
			return;
		}

		const abort = new AbortController();
		onCleanup(() => abort.abort());

		const sign = async () => {
			const response = await Api.client.routes.fave.all.$get(undefined, { init: { signal: abort.signal } });
			if (!response.ok) throw new Error(`Failed to fetch favorites: ${response.statusText}`);
			const data = await response.json();
			// No favorites need no preview token to renew.
			return { ...data, lifetime: data.preview?.lifetime };
		};

		const load = async () => {
			for await (const data of Relay.renew(sign, abort.signal)) {
				tokens.set(data.preview ? [data.preview.token] : []);
				connection.url.set(data.preview ? new URL(data.preview.relay) : undefined);
				setFavorites(data.favorites);
			}
		};

		load().catch((err: unknown) => {
			if (!abort.signal.aborted) console.error("Failed to fetch favorites", err);
		});
	});

	const handleRemove = async (room: string) => {
		try {
			const response = await Api.client.routes.fave[":room"].remove.$post({
				param: { room },
			});
			if (response.ok) {
				setReload((n) => n + 1);
			}
		} catch (error) {
			console.error("Failed to remove favorite:", error);
		}
	};

	return (
		<Layout link="/about">
			{/* Two Column Layout */}
			<div class="flex flex-wrap gap-6 mb-8 items-start">
				<div class="flex-1 basis-md grow space-y-6">
					<div class="rounded-2xl border border-gray-800 p-6">
						<div class="flex items-center justify-between mb-8">
							<div class="flex items-center gap-2">
								<span class="icon-[mdi--heart] text-red-500" />
								<h2 class="text-xl font-semibold underline decoration-red-500/60 underline-offset-2">
									Join a hang
								</h2>
							</div>
						</div>
						<Show
							when={authenticated()}
							fallback={
								<div class="text-center">
									<span class="icon-[mdi--heart-outline] w-12 h-12 text-gray-500 mx-auto mb-4" />
									<h3 class="text-lg font-semibold">Sign in to favorite hangs</h3>
									<div class="text-gray-400 text-sm leading-relaxed mb-8">
										so you can tell when your friends are eager to hang
									</div>
									<Login small />
								</div>
							}
						>
							<Switch>
								<Match when={favorites() === undefined}>
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
													{(favorite, index) => (
														<FavoriteRoom
															// Collapsed cards stay mounted so their rooms still count toward the badge.
															hidden={!showMore() && index() >= 6}
															room={favorite.room}
															createdAt={favorite.created_at}
															onRemove={handleRemove}
															connection={connection}
															badge={badge}
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
				<div class="grow basis-sm space-y-6">
					<div class="rounded-2xl border border-gray-800 p-6">
						<div class="flex items-center justify-between mb-4">
							<div class="flex items-center gap-2">
								<span class="icon-[mdi--play] text-green-500" />
								<span class="text-xl font-semibold underline decoration-green-500/80 underline-offset-2">
									Start a hang
								</span>
							</div>
						</div>

						<CreateHang />
					</div>
					<div class="rounded-2xl border border-gray-800 p-6">
						<Profile local={local} />
					</div>
				</div>
			</div>
		</Layout>
	);
}

function FavoriteRoom(props: {
	hidden: boolean;
	room: string;
	createdAt: number;
	onRemove: (room: string) => void;
	connection: Moq.Connection;
	badge: Badge;
}): JSX.Element {
	const [removing, setRemoving] = createSignal(false);
	const [memberCount, setMemberCount] = createSignal(0);
	let contribution = 0;

	createEffect(() => {
		const count = memberCount();
		if (count === contribution) return;
		props.badge.increment(count - contribution);
		contribution = count;
	});
	onCleanup(() => {
		if (contribution) props.badge.decrement(contribution);
	});

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
				hidden: props.hidden,
				"opacity-50 pointer-events-none": removing(),
			}}
		>
			<div class="flex items-center justify-between">
				<a
					href={`/@${props.room}`}
					class="flex-1 min-w-0 truncate cursor-pointer"
					onclick={() => {
						Local.join.set(true);
					}}
				>
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
			<PreviewRoomCompact connection={props.connection} path={props.room} setMemberCount={setMemberCount} />
		</div>
	);
}
