import { Publish } from "@kixelated/hang";
import { Effect } from "@kixelated/signals";
import { createSignal, JSX, onCleanup, Show } from "solid-js";
import * as Api from "../api";
import { Camera, Microphone } from "../controls";
import { Broadcast } from "../room/broadcast";
import { Canvas } from "../room/canvas";
import { Local } from "../room/local";
import { Sound } from "../room/sound";
import { Space } from "../room/space";
import Settings from "../settings";
import AnotherOne from "./another-one";
import Tooltip from "./tooltip";

export default function Profile(props: { local: Local }): JSX.Element {
	const [avatarClicks, setAvatarClicks] = createSignal(0);
	const [nameClicks, setNameClicks] = createSignal(0);

	const canvas = document.createElement("canvas");
	canvas.classList.add("w-full", "h-full");

	const local = new LocalPreview(canvas, props.local.camera);
	onCleanup(() => local.close());

	const handleRandomAvatar = () => {
		const avatar = Settings.account.avatar.peek();

		setAvatarClicks((prev) => prev + 1);
		while (true) {
			const newAvatar = Api.randomAvatar();
			if (newAvatar !== avatar) {
				Settings.account.avatar.set(newAvatar);
				break;
			}
		}
	};

	const handleRandomName = () => {
		setNameClicks((prev) => prev + 1);
		const name = Settings.account.name.peek();

		while (true) {
			const newName = Api.randomName();
			if (newName !== name) {
				Settings.account.name.set(newName);
				break;
			}
		}
	};

	return (
		<div class="flex flex-col items-center mb-4 space-y-4">
			<div class="flex self-start items-center gap-2 text-xl font-semibold mb-4 underline decoration-blue-500/80 underline-offset-2">
				<span class="icon-[mdi--account] text-blue-500" />
				Your <Show when={!Api.client.authenticated()}>Guest</Show> Profile
			</div>

			{/* Avatar/Video Preview */}

			<div class="relative text-center">
				<div class="h-48 rounded-3xl flex items-center justify-center">{canvas}</div>
			</div>

			{/* Media Controls */}
			<div class="flex gap-3 justify-center mb-6">
				<Microphone local={props.local} />
				<Camera local={props.local} />
				<Show when={Api.client.authenticated()}>
					<Tooltip content="Edit your profile" position="top">
						<a
							href="/account"
							class="text-gray-400 hover:text-white transition-colors flex center hover:bg-gray-700 p-2 rounded-md"
						>
							<span class="icon-[mdi--account-edit]" />
						</a>
					</Tooltip>
				</Show>
			</div>

			<Show when={!Api.client.authenticated()}>
				<div class="flex gap-3">
					<div class="relative">
						<button
							type="button"
							onClick={handleRandomAvatar}
							class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer flex items-center gap-2"
						>
							<span class="icon-[mdi--dice-multiple] w-4 h-4" />
							Avatar
						</button>
						<AnotherOne clicks={avatarClicks} />
					</div>

					<div class="relative">
						<button
							type="button"
							onClick={handleRandomName}
							class="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-xl font-medium transition-all transform hover:scale-105 cursor-pointer flex items-center gap-2"
						>
							<span class="icon-[mdi--dice-multiple] w-4 h-4" />
							Name
						</button>
						<AnotherOne clicks={nameClicks} />
					</div>
				</div>
			</Show>
		</div>
	);
}

/**
 * LocalPreview manages a small canvas preview of the local camera broadcast
 * before joining a room. It creates a minimal broadcast instance and renders
 * it continuously to a canvas element.
 */
class LocalPreview {
	canvas: Canvas;
	broadcast: Broadcast<Publish.Broadcast>;
	sound: Sound;
	space: Space;

	signals = new Effect();

	constructor(element: HTMLCanvasElement, camera: Publish.Broadcast) {
		// Create a minimal canvas without the background effects
		this.canvas = new Canvas(element, { demo: false });

		// Create a minimal sound context (muted for preview)
		this.sound = new Sound();
		this.sound.suspended.set(true); // Keep suspended for preview

		this.space = new Space(this.canvas, this.sound, {
			// Not elegant, but disable some of the functionality for this profile preview.
			profile: true,
		});

		// Create a broadcast wrapper for rendering
		this.broadcast = new Broadcast(camera, this.canvas, this.sound, {
			visible: true,
			position: {
				x: 0,
				y: 0,
				z: 0,
				s: 1,
			},
		});

		this.space.add("local", this.broadcast);

		this.signals.effect((effect: Effect) => {
			const position = effect.get(this.broadcast.position);
			if (position.x === 0 && position.y === 0 && position.s === 1) return;

			// Reset the position after 2 seconds.
			effect.timer(() => {
				this.broadcast.position.set({
					x: 0,
					y: 0,
					z: 0,
					s: 1,
				});
			}, 2000);
		});
	}

	close() {
		this.space.close();
		this.canvas.close();
		this.sound.close();
		this.broadcast.close(); // NOTE: Doesn't close the source broadcast.
		this.signals.close();
	}
}
