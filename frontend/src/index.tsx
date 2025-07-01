import "tauri-plugin-web-transport";

import "@kixelated/hang/support/element";

import solid from "@kixelated/signals/solid";
import { Route, Router } from "@solidjs/router";
import { Show, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { render } from "solid-js/web";
import { About } from "./about";
import { Login } from "./account";
import { type User, authService } from "./auth";
import { Canvas } from "./canvas";
import { Chat } from "./chat";
import { Controls } from "./controls";
import { Room } from "./room";

export function Hang(): JSX.Element {
	const [authenticated, setAuthenticated] = createSignal(false);
	const [authLoaded, setAuthLoaded] = createSignal(false);

	const canvas = new Canvas();
	onCleanup(() => canvas.close());

	onMount(async () => {
		// Handle OAuth callback first
		const handled = await authService.handleOAuthCallback();
		if (handled) {
			console.log("OAuth callback handled");
		}

		// Check authentication status
		setAuthenticated(authService.isAuthenticated());
		setAuthLoaded(true);
	});

	/*
	const handleLogout = () => {
		authService.logout();
		setAuthenticated(false);
		// Navigate to home page after logout
		window.location.href = "/";
	};
	*/

	return (
		<Show when={authLoaded()} fallback={<div>Loading...</div>}>
			<Router>
				<Route path="/" component={About} />
				<Route path="/account" component={Login} />
				<Route
					path="/demo"
					component={() => (
						<Show when={authenticated()} fallback={<Login />}>
							<Demo canvas={canvas} />
						</Show>
					)}
				/>
			</Router>
		</Show>
	);
}

function Demo(props: { canvas: Canvas }): JSX.Element {
	const user = authService.getUser();

	const room = new Room(props.canvas, {
		user: user?.name ?? "Anonymous",
		avatar: user?.avatar_url ?? undefined,
	});

	onCleanup(() => room.close());

	const username = solid(room.user);
	const suspended = solid(room.suspended);

	// Auto-set the user from auth if not already set
	createEffect(() => {
		if (user && !username()) {
			room.user.set(user.name);
		}
	});

	return (
		<>
			<div>
				<Autoplay suspended={suspended()} />
				<Chat canvas={props.canvas} room={room} />
				<Controls room={room} camera={room.camera} screen={room.screen} canvas={props.canvas} />
			</div>
		</>
	);
}

function _UserMenu(props: { user: User | null; onLogout: () => void }): JSX.Element {
	const [isOpen, setIsOpen] = createSignal(false);

	const toggleMenu = () => setIsOpen(!isOpen());
	const closeMenu = () => setIsOpen(false);

	return (
		<div class="relative">
			<button
				type="button"
				onClick={toggleMenu}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						toggleMenu();
					}
				}}
				class="flex items-center gap-2 bg-black/50 backdrop-blur-sm rounded-lg px-3 py-2 text-white hover:bg-black/70 transition-colors"
			>
				<Show when={props.user?.avatar_url}>
					<img src={props.user?.avatar_url} alt={props.user?.name} class="w-6 h-6 rounded-full" />
				</Show>
				<span class="text-sm font-medium">{props.user?.name}</span>
			</button>

			<Show when={isOpen()}>
				<div class="absolute top-12 right-0 bg-black/80 backdrop-blur-sm rounded-lg border border-white/10 py-2 min-w-[120px]">
					<button
						type="button"
						onClick={() => {
							props.onLogout();
							closeMenu();
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								props.onLogout();
								closeMenu();
							}
						}}
						class="w-full text-left px-4 py-2 text-sm text-white hover:bg-white/10 transition-colors"
					>
						Sign out
					</button>
				</div>
			</Show>

			{/* Click outside to close */}
			<Show when={isOpen()}>
				<div
					class="fixed inset-0 z-[-1]"
					onClick={closeMenu}
					onKeyDown={(e) => {
						if (e.key === "Escape") {
							closeMenu();
						}
					}}
					role="presentation"
				/>
			</Show>
		</div>
	);
}

function Autoplay(props: { suspended: boolean }): JSX.Element {
	return (
		<Show when={props.suspended}>
			<div class="absolute inset-0 bg-black/50 flex items-center justify-center">
				<div class="text-white text-2xl font-bold">Click anywhere to enable audio.</div>
			</div>
		</Show>
	);
}

const hang = document.getElementById("hang");
if (!hang) {
	throw new Error("No hang element found");
}

render(() => <Hang />, hang);
