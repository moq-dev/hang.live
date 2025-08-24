import type { Publish } from "@kixelated/hang";
import { createSignal, For, onCleanup, onMount, Show, type Setter } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import IconClose from "~icons/mdi/close";
import IconEmoticon from "~icons/mdi/emoticon-happy";
import IconMusic from "~icons/mdi/music";
import IconPlay from "~icons/mdi/play";
import IconVideo from "~icons/mdi/video";
import { ALL_EMOJIS, EMOJI_CATEGORIES, MEME_AUDIO, MEME_VIDEO } from "../room/meme";

type Tab = "emoji" | "audio" | "video";

export type MemeSelectorProps = {
	broadcast: Publish.Broadcast;
	chatInput: HTMLInputElement | undefined;
	chatMessage: string;
	setChatMessage: Setter<string>;
	onClose: () => void;
};

export function MemeSelector(props: MemeSelectorProps): JSX.Element {
	const [activeTab, setActiveTab] = createSignal<Tab>("emoji");
	const [searchQuery, setSearchQuery] = createSignal("");
	const [previewAudio, setPreviewAudio] = createSignal<HTMLAudioElement | null>(null);
	const [previewVideo, setPreviewVideo] = createSignal<HTMLVideoElement | null>(null);
	const [modal, setModal] = createSignal<HTMLDivElement | undefined>(undefined);

	// Clean up any playing previews when component unmounts
	onCleanup(() => {
		previewAudio()?.pause();
		previewVideo()?.pause();
	});

	// Close on escape key
	const handleKeyDown = (e: KeyboardEvent) => {
		if (e.key === "Escape") {
			props.onClose();
		}
	};

	onMount(() => {
		window.addEventListener("keydown", handleKeyDown);
		onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
	});

	// Handle clicking outside
	const handleClickOutside = (e: MouseEvent) => {
		if (modal() && !modal()?.contains(e.target as Node)) {
			props.onClose();
		}
	};

	onMount(() => {
		// Delay to prevent immediate close from the button click that opened it
		setTimeout(() => {
			window.addEventListener("click", handleClickOutside);
		}, 100);
		onCleanup(() => window.removeEventListener("click", handleClickOutside));
	});

	const insertEmoji = (emoji: string) => {
		const input = props.chatInput;
		if (!input) {
			props.setChatMessage(props.chatMessage + emoji);
			return;
		}

		const start = input.selectionStart ?? props.chatMessage.length;
		const end = input.selectionEnd ?? props.chatMessage.length;
		const newMessage = props.chatMessage.slice(0, start) + emoji + props.chatMessage.slice(end);
		props.setChatMessage(newMessage);

		// Set cursor position after emoji
		setTimeout(() => {
			input.focus();
			const newPosition = start + emoji.length;
			input.setSelectionRange(newPosition, newPosition);
		}, 0);
	};

	const sendMeme = (memeName: string) => {
		// Send the slash command
		if (props.broadcast.chat.enabled.peek()) {
			props.broadcast.chat.message.set(() => `/${memeName}`);
		}
		props.onClose();
	};

	const previewMeme = (memeName: string, type: "audio" | "video") => {
		// Stop any existing preview
		previewAudio()?.pause();
		previewVideo()?.pause();
		setPreviewAudio(null);
		setPreviewVideo(null);

		if (type === "audio") {
			const audio = new Audio(`/meme/${MEME_AUDIO[memeName as keyof typeof MEME_AUDIO]}`);
			audio.volume = 0.5; // Lower volume for preview
			audio.play();
			setPreviewAudio(audio);

			// Clean up when done
			audio.onended = () => setPreviewAudio(null);
		} else {
			const video = document.createElement("video");
			video.src = `/meme/${MEME_VIDEO[memeName as keyof typeof MEME_VIDEO]}`;
			video.volume = 0.5;
			video.style.display = "none";
			document.body.appendChild(video);
			video.play();
			setPreviewVideo(video);

			// Clean up when done
			video.onended = () => {
				video.remove();
				setPreviewVideo(null);
			};
		}
	};

	const filteredAudioMemes = () => {
		const query = searchQuery().toLowerCase();
		if (!query) return Object.keys(MEME_AUDIO);
		return Object.keys(MEME_AUDIO).filter((name) => name.toLowerCase().includes(query));
	};

	const filteredVideoMemes = () => {
		const query = searchQuery().toLowerCase();
		if (!query) return Object.keys(MEME_VIDEO);
		return Object.keys(MEME_VIDEO).filter((name) => name.toLowerCase().includes(query));
	};


	return (
		<div
			ref={setModal}
			class="fixed bottom-20 left-1/2 transform -translate-x-1/2 w-[600px] max-w-[90vw] bg-gray-900 border border-gray-700 rounded-lg shadow-2xl pointer-events-auto backdrop-blur-md z-[100]"
		>
			{/* Header with tabs */}
			<div class="flex items-center justify-between border-b border-gray-700 p-3">
				<div class="flex gap-2">
					<button
						type="button"
						onClick={() => setActiveTab("emoji")}
						class="px-3 py-1.5 rounded flex items-center gap-1.5 text-sm transition-colors"
						classList={{
							"bg-gray-700 text-white": activeTab() === "emoji",
							"hover:bg-gray-800 text-gray-400": activeTab() !== "emoji",
						}}
					>
						<IconEmoticon class="w-4 h-4" />
						Emoji
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("audio")}
						class="px-3 py-1.5 rounded flex items-center gap-1.5 text-sm transition-colors"
						classList={{
							"bg-gray-700 text-white": activeTab() === "audio",
							"hover:bg-gray-800 text-gray-400": activeTab() !== "audio",
						}}
					>
						<IconMusic class="w-4 h-4" />
						Audio
					</button>
					<button
						type="button"
						onClick={() => setActiveTab("video")}
						class="px-3 py-1.5 rounded flex items-center gap-1.5 text-sm transition-colors"
						classList={{
							"bg-gray-700 text-white": activeTab() === "video",
							"hover:bg-gray-800 text-gray-400": activeTab() !== "video",
						}}
					>
						<IconVideo class="w-4 h-4" />
						Video
					</button>
				</div>
				<button
					type="button"
					onClick={props.onClose}
					class="p-1 hover:bg-gray-700 rounded transition-colors"
					aria-label="Close"
				>
					<IconClose class="w-5 h-5" />
				</button>
			</div>

			{/* Search bar */}
			<Show when={activeTab() !== "emoji"}>
				<div class="p-3 border-b border-gray-700">
					<input
						type="text"
						placeholder={`Search ${activeTab()} memes...`}
						value={searchQuery()}
						onInput={(e) => setSearchQuery(e.currentTarget.value)}
						class="w-full px-3 py-1.5 bg-gray-800 border border-gray-600 rounded text-sm focus:outline-none focus:border-gray-500"
					/>
				</div>
			</Show>

			{/* Content area */}
			<div class="p-3 max-h-[400px] overflow-y-auto custom-scrollbar">
				{/* Emoji Grid */}
				<Show when={activeTab() === "emoji"}>
					<div class="space-y-4">
						<For each={Object.entries(EMOJI_CATEGORIES)}>
							{([category, emojis]) => (
								<div>
									<div class="text-xs text-gray-400 uppercase tracking-wider mb-2">{category}</div>
									<div class="grid grid-cols-10 gap-1">
										<For each={emojis}>
											{(emoji) => (
												<button
													type="button"
													onClick={() => insertEmoji(emoji)}
													class="p-2 hover:bg-gray-700 rounded transition-colors text-xl cursor-pointer"
													title={`Insert ${emoji}`}
												>
													{emoji}
												</button>
											)}
										</For>
									</div>
								</div>
							)}
						</For>
					</div>
				</Show>

				{/* Audio Memes Grid */}
				<Show when={activeTab() === "audio"}>
					<div class="grid grid-cols-3 gap-2">
						<For each={filteredAudioMemes()}>
							{(meme) => (
								<div class="group relative bg-gray-800 hover:bg-gray-700 rounded p-3 transition-colors">
									<button
										type="button"
										onClick={() => sendMeme(meme)}
										class="w-full text-left text-sm truncate"
										title={`Send /${meme}`}
									>
										{meme}
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											previewMeme(meme, "audio");
										}}
										class="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-gray-600 hover:bg-gray-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
										title="Preview"
									>
										<IconPlay class="w-4 h-4" />
									</button>
								</div>
							)}
						</For>
					</div>
				</Show>

				{/* Video Memes Grid */}
				<Show when={activeTab() === "video"}>
					<div class="grid grid-cols-3 gap-2">
						<For each={filteredVideoMemes()}>
							{(meme) => (
								<div class="group relative bg-gray-800 hover:bg-gray-700 rounded p-3 transition-colors">
									<button
										type="button"
										onClick={() => sendMeme(meme)}
										class="w-full text-left text-sm truncate"
										title={`Send /${meme}`}
									>
										{meme}
									</button>
									<button
										type="button"
										onClick={(e) => {
											e.stopPropagation();
											previewMeme(meme, "video");
										}}
										class="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-gray-600 hover:bg-gray-500 rounded opacity-0 group-hover:opacity-100 transition-opacity"
										title="Preview"
									>
										<IconPlay class="w-4 h-4" />
									</button>
								</div>
							)}
						</For>
					</div>
				</Show>
			</div>

			{/* Playing indicator */}
			<Show when={previewAudio() || previewVideo()}>
				<div class="absolute top-2 right-12 bg-green-600 text-white text-xs px-2 py-1 rounded animate-pulse">
					Playing preview...
				</div>
			</Show>
		</div>
	);
}