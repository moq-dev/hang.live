import * as Api from "@hang/api/client";
import { createResource, For, Match, Switch } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconAccountGroup from "~icons/mdi/account-group";
import IconVideo from "~icons/mdi/video";
import { Layout } from "./layout";
import { LoginButtons } from "./login-buttons";

export function Fave(props: { api: Api.Client }): JSX.Element {
	const [favorites] = createResource(async () => {
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

	return (
		<Layout api={props.api}>
			<div class="max-w-4xl mx-auto p-4">
				<h1 class="text-2xl font-bold mb-6">Favorites</h1>

				<Switch>
					<Match when={!props.api.authenticated()}>
						<div class="flex justify-center">
							<div class="max-w-sm w-full">
								<LoginButtons api={props.api} message="Login to view your favorite rooms" />
							</div>
						</div>
					</Match>
					<Match when={favorites.loading}>
						<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
							<For each={[1, 2, 3]}>
								{() => (
									<div class="bg-gray-800 rounded-xl p-4 animate-pulse">
										<div class="h-6 bg-gray-700 rounded mb-2"></div>
										<div class="h-4 bg-gray-700 rounded w-2/3"></div>
									</div>
								)}
							</For>
						</div>
					</Match>
					<Match when={favorites()?.length === 0}>
						<div class="text-center py-12">
							<p class="text-gray-400 mb-4">You haven't favorited any rooms yet</p>
							<p class="text-gray-500 text-sm">Star a room to add it to your favorites</p>
						</div>
					</Match>
					<Match when={favorites()}>
						{(favs) => (
							<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
								<For each={favs()}>{(favorite) => <FavoriteRoom room={favorite.room} />}</For>
							</div>
						)}
					</Match>
				</Switch>
			</div>
		</Layout>
	);
}

function FavoriteRoom(props: { room: string }): JSX.Element {
	// For now, we'll just show the room name
	// In the future, this could fetch live member count from the server

	return (
		<a
			href={`/demo/${props.room}`}
			class="bg-gray-800 hover:bg-gray-700 rounded-xl p-4 transition-all hover:scale-105 cursor-pointer flex flex-col gap-3"
		>
			<div class="flex items-center justify-between">
				<h3 class="font-semibold text-lg truncate">{props.room}</h3>
				<IconVideo class="w-5 h-5 text-gray-400" />
			</div>

			<div class="flex items-center gap-2 text-sm text-gray-400">
				<IconAccountGroup class="w-4 h-4" />
				<span>Hang</span>
			</div>
		</a>
	);
}
