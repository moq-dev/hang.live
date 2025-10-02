import * as Moq from "@kixelated/moq";
import solid from "@kixelated/signals/solid";
import { createResource, createSignal, JSX, Show } from "solid-js";
import * as Api from "../api";
import Login from "../components/login";
import Tooltip from "../components/tooltip";
import Settings from "../settings";
import { isMobile } from "../util/mobile";
import { Logo } from "./logo";

export default function App(props: { children: JSX.Element; connection: Moq.Connection.Reload; room: string }) {
	return (
		<div class="p-4 mx-auto w-full flex flex-col min-h-screen">
			<Header connection={props.connection} room={props.room} />
			{props.children}
		</div>
	);
}

function Header(props: { connection: Moq.Connection.Reload; room: string }) {
	const mobile = isMobile();
	const [showMobileNav, setShowMobileNav] = createSignal(false);
	const activeStep = solid(Settings.tutorial.step);

	return (
		<header
			class="flex items-center justify-between leading-none text-xl relative transition-all duration-300"
			classList={{
				"z-auto": activeStep() !== 3,
				"z-[1001]": activeStep() === 3,
			}}
		>
			<div
				class="transition-opacity duration-300"
				classList={{
					"opacity-0": mobile() && showMobileNav(),
					"opacity-100": !mobile() || !showMobileNav(),
				}}
			>
				<Logo connection={props.connection} />
			</div>
			<div id="support" />
			<nav class="rounded p-3 flex items-center gap-3 transition-all duration-300 ease-in-out">
				<Show
					when={!mobile()}
					fallback={
						<Show
							when={!showMobileNav()}
							fallback={
								<>
									<div
										class="flex items-center gap-3 transition-all duration-300 ease-in-out"
										style={{
											animation: "slideInFromRight 0.3s ease-out",
										}}
									>
										<RoomNavMobile room={props.room} />
									</div>
									<button
										type="button"
										onClick={() => setShowMobileNav(false)}
										class="p-2 text-red-500 hover:text-red-400 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
										aria-label="Close navigation"
										style={{
											animation: "fadeIn 0.2s ease-out",
										}}
									>
										<span class="icon-[mdi--close]" />
									</button>
									<style>
										{`
											@keyframes slideInFromRight {
												from {
													opacity: 0;
													transform: translateX(20px);
												}
												to {
													opacity: 1;
													transform: translateX(0);
												}
											}
											@keyframes fadeIn {
												from {
													opacity: 0;
												}
												to {
													opacity: 1;
												}
											}
										`}
									</style>
								</>
							}
						>
							{/* Mobile: Just hamburger button */}
							<button
								type="button"
								onClick={() => setShowMobileNav(true)}
								class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
								aria-label="Open navigation"
							>
								<span class="icon-[mdi--menu]" />
							</button>
						</Show>
					}
				>
					{/* Desktop: Show all nav items */}
					<RoomNav room={props.room} />
					<Tooltip content="Account settings" position="bottom">
						<a
							href="/account"
							rel="noopener"
							target="_blank"
							class="p-2 text-white hover:text-gray-300 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
						>
							<span class="icon-[mdi--account]" />
						</a>
					</Tooltip>
				</Show>
			</nav>
		</header>
	);
}

function RoomNav(props: { room: string }) {
	const [showCopiedNotification, setShowCopiedNotification] = createSignal(false);

	const share = async () => {
		const url = window.location.href;
		await navigator.clipboard.writeText(url);

		setShowCopiedNotification(true);
		setTimeout(() => {
			setShowCopiedNotification(false);
		}, 3000);
	};

	return (
		<>
			<Tooltip content="Leave" position="bottom">
				<a
					href="/home"
					class="p-2 text-white hover:text-red-500 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
				>
					<span class="icon-[mdi--exit-run]" />
				</a>
			</Tooltip>
			<FavoriteButton room={props.room} />
			<Tooltip
				content={showCopiedNotification() ? "Copied to clipboard" : "Copy link"}
				position="bottom"
				force={showCopiedNotification()}
			>
				<button
					type="button"
					onClick={share}
					class="p-2 text-white hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
					classList={{
						"animate-pulse": showCopiedNotification(),
					}}
				>
					<span class="icon-[mdi--share-variant]" />
				</button>
			</Tooltip>
		</>
	);
}

function RoomNavMobile(props: { room: string }) {
	const [showCopiedNotification, setShowCopiedNotification] = createSignal(false);

	const share = async () => {
		const url = window.location.href;
		await navigator.clipboard.writeText(url);

		setShowCopiedNotification(true);
		setTimeout(() => {
			setShowCopiedNotification(false);
		}, 3000);
	};

	return (
		<>
			<Tooltip content="Leave" position="bottom">
				<a
					href="/home"
					class="p-2 text-white hover:text-red-500 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
				>
					<span class="icon-[mdi--exit-run]" />
				</a>
			</Tooltip>
			<FavoriteButton room={props.room} />
			<Tooltip
				content={showCopiedNotification() ? "Copied to clipboard" : "Copy link"}
				position="bottom"
				force={showCopiedNotification()}
			>
				<button
					type="button"
					onClick={share}
					class="p-2 text-white hover:text-blue-400 hover:bg-gray-700 rounded-lg transition-all cursor-pointer"
					classList={{
						"animate-pulse": showCopiedNotification(),
					}}
				>
					<span class="icon-[mdi--share-variant]" />
				</button>
			</Tooltip>
		</>
	);
}

function FavoriteButton(props: { room: string }) {
	const [isToggling, setIsToggling] = createSignal(false);
	const [showLoginPrompt, setShowLoginPrompt] = createSignal(false);
	const authenticated = solid(Api.client.authenticated);

	const [isFavorite, { refetch }] = createResource(
		() => (authenticated() ? props.room : null),
		async (room) => {
			if (!room) return false;
			try {
				const response = await Api.client.routes.fave[":room"].$get({
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

		if (!authenticated()) {
			setShowLoginPrompt(true);
			return;
		}

		setIsToggling(true);
		try {
			let response: Response;
			if (isFavorite()) {
				response = await Api.client.routes.fave[":room"].remove.$post({
					param: { room: props.room },
				});
			} else {
				response = await Api.client.routes.fave[":room"].add.$post({
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
					!authenticated()
						? "Sign in to favorite hangs"
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
						"text-yellow-400": authenticated() && isFavorite() && !isFavorite.loading,
						"text-gray-400": !authenticated(),
					}}
				>
					<Show when={authenticated()} fallback={<span class="icon-[mdi--heart-outline]" />}>
						<Show
							when={!isFavorite.loading}
							fallback={<span class="icon-[mdi--heart-outline] animate-pulse" />}
						>
							<Show when={isFavorite()} fallback={<span class="icon-[mdi--heart-outline]" />}>
								<span class="icon-[mdi--heart] text-red-400" />
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
						<div class="text-center text-lg font-semibold mb-4">Sign in to favorite hangs</div>
						<Login small />
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
