import * as Api from "@hang/api/client";
import { useNavigate } from "@solidjs/router";
import { createMemo, createSignal, type JSX, Match, onMount, Switch } from "solid-js";
import * as Random from "../util/random";
import Dialog from "./dialog";
import Gradient from "./gradient";

export default function Create(): JSX.Element {
	const navigate = useNavigate();
	const [roomInput, setRoomInput] = createSignal("");
	const [placeholder, setPlaceholder] = createSignal(Random.room());

	// Regenerate placeholder periodically
	onMount(() => {
		const interval = setInterval(() => {
			if (!roomInput()) {
				setPlaceholder(Random.room());
			}
		}, 5000);
		return () => clearInterval(interval);
	});

	const roomName = createMemo(() => {
		const input = roomInput().trim();
		return input || placeholder();
	});

	const roomNameError = createMemo(() => {
		const name = roomInput().trim();
		if (!name) return null;

		if (!Api.isValidRoom(name)) {
			return Api.ROOM_NAME_ERROR;
		}
		return null;
	});

	const handleCreate = (e: Event) => {
		e.preventDefault();
		const name = roomName();
		if (name && Api.isValidRoom(name)) {
			navigate(`/@${name}`);
		}
	};

	return (
		<div class="space-y-4">
			<form onSubmit={handleCreate} class="space-y-4">
				<div class="flex flex-wrap gap-3">
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
			</form>

			<Switch
				fallback={
					<div class="text-gray-400 text-sm text-center">choose a name for the hang, or use a random one</div>
				}
			>
				<Match when={roomNameError()}>
					{(error) => (
						<Dialog
							icon="icon-[mdi--alert-circle-outline]"
							title="Invalid room name"
							description={error()}
							variant="error"
						/>
					)}
				</Match>
				<Match when={roomInput()}>
					<Dialog
						icon="icon-[mdi--information-outline]"
						title="Hangs are public"
						description="Anybody with this URL can join. Use something cool and unique if you want to keep strangers out."
					/>
				</Match>
			</Switch>
		</div>
	);
}
