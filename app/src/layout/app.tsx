import * as Api from "@hang/api/client";
import { Connection } from "@kixelated/hang";
import { createMemo, createResource, createSignal, JSX, Show } from "solid-js";
import Login from "../components/login";
import Tooltip from "../components/tooltip";
import { Logo } from "./logo";

export default function App(props: { children: JSX.Element; connection: Connection; api: Api.Client; room: string }) {
	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-screen">
			<header class="flex items-center justify-between mb-4">
				<Logo connection={props.connection} />
				<div id="support" />
				<nav class="rounded p-3 flex items-center gap-3">
					<RoomNav api={props.api} room={props.room} />
					<Tooltip content="Account settings" position="bottom">
						<a
							href="/account"
							rel="noopener"
							target="_blank"
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<span class="icon-[mdi--account] w-5 h-5" />
						</a>
					</Tooltip>
				</nav>
			</header>

			{props.children}
		</div>
	);
}

function RoomNav(props: { api: Api.Client; room: string }) {
	const share = async () => {
		const url = window.location.href;

		if (navigator.share) {
			await navigator.share({
				title: "hang.live",
				text: "hang with us!",
				url,
			});
		} else {
			await navigator.clipboard.writeText(url);
		}
	};

	return (
		<>
			<Tooltip content="Leave" position="bottom">
				<a
					href="/start"
					class="p-2 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
				>
					<span class="icon-[mdi--exit-run] w-5 h-5" />
				</a>
			</Tooltip>
			<FavoriteButton api={props.api} room={props.room} />
			<Tooltip content="Share link" position="bottom">
				<button
					type="button"
					onClick={share}
					class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
				>
					<span class="icon-[mdi--share-variant] w-5 h-5" />
				</button>
			</Tooltip>
		</>
	);
}

function FavoriteButton(props: { api: Api.Client; room: string }) {
	const [isToggling, setIsToggling] = createSignal(false);
	const [showLoginPrompt, setShowLoginPrompt] = createSignal(false);

	const showFavorite = createMemo(() => {
		return props.api.authenticated();
	});

	const [isFavorite, { refetch }] = createResource(
		() => (showFavorite() ? props.room : null),
		async (room) => {
			if (!room) return false;
			try {
				const response = await props.api.routes.fave[":room"].$get({
					param: { room },
				});
				if (response.ok) {
					const data = await response.json();
					return data.is_favorite;
				}
			} catch (error) {
				console.error("Failed to fetch favorite status:", error);
			}
			return false;
		},
	);

	const toggleFavorite = async () => {
		if (!props.room || isToggling()) return;

		if (!props.api.authenticated()) {
			setShowLoginPrompt(true);
			return;
		}

		setIsToggling(true);
		try {
			let response: Response;
			if (isFavorite()) {
				response = await props.api.routes.fave[":room"].remove.$post({
					param: { room: props.room },
				});
			} else {
				response = await props.api.routes.fave[":room"].add.$post({
					param: { room: props.room },
				});
			}
			if (response.ok) {
				refetch();
			}
		} catch (error) {
			console.error("Failed to toggle favorite:", error);
		} finally {
			setIsToggling(false);
		}
	};

	return (
		<>
			<Tooltip
				content={
					!props.api.authenticated()
						? "Login to favorite hangs"
						: isFavorite.loading
							? "Loading..."
							: isFavorite()
								? "Remove from favorites"
								: "Add to favorites"
				}
				position="bottom"
			>
				<button
					type="button"
					onClick={toggleFavorite}
					disabled={isFavorite.loading || isToggling()}
					class="p-2 text-white hover:text-yellow-400 hover:bg-gray-700 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					classList={{
						"text-yellow-400": props.api.authenticated() && isFavorite() && !isFavorite.loading,
						"text-gray-400": !props.api.authenticated(),
					}}
				>
					<Show when={props.api.authenticated()} fallback={<span class="icon-[mdi--heart-outline] w-5 h-5" />}>
						<Show when={!isFavorite.loading} fallback={<span class="icon-[mdi--heart-outline] w-5 h-5 animate-pulse" />}>
							<Show when={isFavorite()} fallback={<span class="icon-[mdi--heart-outline] w-5 h-5" />}>
								<span class="icon-[mdi--heart] w-5 h-5 text-red-400" />
							</Show>
						</Show>
					</Show>
				</button>
			</Tooltip>

			<Show when={showLoginPrompt()}>
				<div
					class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
					onClick={() => setShowLoginPrompt(false)}
					onKeyDown={(e) => e.key === "Escape" && setShowLoginPrompt(false)}
					role="dialog"
					tabIndex={-1}
				>
					<div
						class="max-w-sm w-full mx-4"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						role="document"
					>
						<div class="text-center text-lg font-semibold mb-4">Login to favorite hangs</div>
						<Login api={props.api} />
						<button
							type="button"
							onClick={() => setShowLoginPrompt(false)}
							class="mt-4 w-full text-gray-400 hover:text-white transition-colors"
						>
							Cancel
						</button>
					</div>
				</div>
			</Show>
		</>
	);
}
