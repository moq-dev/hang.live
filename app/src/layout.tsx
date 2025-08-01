import * as Api from "@hang/api/client";
import { Connection } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { useLocation, useParams } from "@solidjs/router";
import { createMemo, createResource, createSignal, JSX, Show } from "solid-js";
import IconAccount from "~icons/mdi/account";
import IconShare from "~icons/mdi/share-variant";
import IconStar from "~icons/mdi/star";
import IconStarOutline from "~icons/mdi/star-outline";
import { Divider } from "./divider";
import { LoginButtons } from "./login-buttons";
import { Tooltip } from "./tooltip";

export function Layout(props: { children: JSX.Element; app?: boolean; connection?: Connection; api?: Api.Client }) {
	const status = props.connection ? solid(props.connection.status) : () => "connected";

	const color = createMemo(() => {
		if (status() === "connected") return "hsl(140, 75%, 50%)";
		if (status() === "connecting") return "hsl(40, 75%, 50%)";
		return "hsl(0, 75%, 50%)";
	});

	const text = createMemo(() => {
		if (status() === "disconnected") return "offline";
		return "live";
	});

	const shareRoom = async () => {
		const url = window.location.href;

		if (navigator.share) {
			await navigator.share({
				title: "hang.live",
				text: "Come hang with us!",
				url,
			});
		} else {
			await navigator.clipboard.writeText(url);
		}
	};

	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-0" classList={{ "max-w-[900px]": !props.app }}>
			<header class="flex items-center justify-between mb-4">
				<a href="/" class="rounded backdrop-blur-sm px-4 py-2 text-2xl">
					<span>hang</span>
					<span
						id="status"
						class="text-xs ml-1 transition-colors duration-1000 ease-in-out"
						style={{ "vertical-align": "-0.2em", color: color() }}
					>
						{text()}
					</span>
				</a>
				<div id="support" />
				<nav class="rounded p-3 flex items-center gap-3">
					<Show when={props.api}>{(api) => <FavoriteButton api={api()} app={props.app} />}</Show>
					<Tooltip content="Share room link" position="bottom">
						<button
							type="button"
							onClick={shareRoom}
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<IconShare class="w-5 h-5" />
						</button>
					</Tooltip>
					<Tooltip content="Account settings" position="bottom">
						<a
							href="/account"
							rel={props.app ? "noopener" : undefined}
							target={props.app ? "_blank" : undefined}
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<IconAccount class="w-5 h-5" />
						</a>
					</Tooltip>
				</nav>
			</header>

			<Show when={!props.app} fallback={props.children}>
				<Divider />
				<main class="flex flex-col relative">{props.children}</main>
			</Show>
		</div>
	);
}

function FavoriteButton(props: { api: Api.Client; app?: boolean }) {
	const location = useLocation();
	const params = useParams();
	const [isToggling, setIsToggling] = createSignal(false);
	const [showLoginPrompt, setShowLoginPrompt] = createSignal(false);

	// Determine if we're in a demo room (using props.app or location)
	const inDemoRoom = createMemo(() => {
		return props.app || (location.pathname.startsWith("/demo/") && params.room);
	});

	// Only fetch when authenticated and in a demo room
	const showFavorite = createMemo(() => {
		return inDemoRoom() && props.api.authenticated();
	});

	// Fetch favorite status when room changes
	const [isFavorite, { refetch }] = createResource(
		() => (showFavorite() ? params.room : null),
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
		const room = params.room;
		if (!room || isToggling() || !inDemoRoom()) return;

		// Show login prompt if not authenticated
		if (!props.api.authenticated()) {
			setShowLoginPrompt(true);
			return;
		}

		setIsToggling(true);
		try {
			let response: Response;
			if (isFavorite()) {
				response = await props.api.routes.fave[":room"].remove.$post({
					param: { room },
				});
			} else {
				response = await props.api.routes.fave[":room"].add.$post({
					param: { room },
				});
			}
			if (response.ok) {
				// Refetch to update the status
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
			{/* Show different star behavior based on whether we're in a demo room */}
			<Show
				when={inDemoRoom()}
				fallback={
					// Not in demo room - star is a link to favorites page
					<Tooltip content="View favorites" position="bottom">
						<a
							href="/fave"
							rel={props.app ? "noopener" : undefined}
							target={props.app ? "_blank" : undefined}
							class="p-2 text-white hover:text-yellow-400 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<IconStarOutline class="w-5 h-5" />
						</a>
					</Tooltip>
				}
			>
				{/* In demo room - star toggles favorite status */}
				<Tooltip
					content={
						!props.api.authenticated()
							? "Login to favorite rooms"
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
						<Show
							when={props.api.authenticated() && !isFavorite.loading}
							fallback={<IconStarOutline class="w-5 h-5 animate-pulse" />}
						>
							<Show when={isFavorite()} fallback={<IconStarOutline class="w-5 h-5" />}>
								<IconStar class="w-5 h-5" />
							</Show>
						</Show>
					</button>
				</Tooltip>
			</Show>

			{/* Login prompt modal-like overlay */}
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
						<LoginButtons api={props.api} message="Login to favorite rooms" />
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
