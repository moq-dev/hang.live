import type { Publish } from "@kixelated/hang";
import solid from "@kixelated/signals/solid";
import { createSignal, For, onCleanup, onMount, type Setter, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import { EMOJI_CATEGORIES, MEME_AUDIO, MEME_VIDEO, MemeVideoName } from "../room/meme";
import Settings from "../settings";

export type Tab = "emoji" | "audio" | "video";

export type MemeSelectorProps = {
	broadcast: Publish.Broadcast;
	chatInput: HTMLInputElement | undefined;
	chatMessage: string;
	setChatMessage: Setter<string>;
	onClose: () => void;
};

export function MemeSelector(props: MemeSelectorProps): JSX.Element {
	// Get the initial tab from localStorage, default to "emoji"
	const activeTab = solid(Settings.meme.tab);
	const [previewAudio, setPreviewAudio] = createSignal<HTMLAudioElement | null>(null);
	const [previewVideo, setPreviewVideo] = createSignal<HTMLVideoElement | null>(null);
	const [playingVideoMeme, setPlayingVideoMeme] = createSignal<string | null>(null);
	const [playingAudioMeme, setPlayingAudioMeme] = createSignal<string | null>(null);
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

	// Save tab preference when it changes
	createSignal(() => {
		localStorage.setItem("settings.memeSelector.tab", activeTab());
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
		if (props.broadcast.chat.message.enabled.peek()) {
			props.broadcast.chat.message.latest.update(() => `/${memeName}`);
		}
		props.onClose();
	};

	const previewMeme = (memeName: string, type: "audio" | "video") => {
		// Check if this meme is already playing
		if (type === "audio" && playingAudioMeme() === memeName) {
			// Stop the audio
			previewAudio()?.pause();
			setPreviewAudio(null);
			setPlayingAudioMeme(null);
			return;
		}
		if (type === "video" && playingVideoMeme() === memeName) {
			// Stop the video
			previewVideo()?.pause();
			previewVideo()?.remove();
			setPreviewVideo(null);
			setPlayingVideoMeme(null);
			return;
		}

		// Stop any existing preview
		previewAudio()?.pause();
		previewVideo()?.pause();
		setPreviewAudio(null);
		setPreviewVideo(null);
		setPlayingVideoMeme(null);
		setPlayingAudioMeme(null);

		if (type === "audio") {
			const audio = new Audio(
				new URL(
					`/meme/${MEME_AUDIO[memeName as keyof typeof MEME_AUDIO].file}`,
					import.meta.env.VITE_APP_URL,
				).toString(),
			);
			audio.volume = 0.5; // Lower volume for preview
			audio.play();
			setPreviewAudio(audio);
			setPlayingAudioMeme(memeName);

			// Clean up when done
			audio.onended = () => {
				setPreviewAudio(null);
				setPlayingAudioMeme(null);
			};
		} else {
			// For video, play with sound
			const video = document.createElement("video");
			video.src = new URL(
				`/meme/${MEME_VIDEO[memeName as keyof typeof MEME_VIDEO].file}`,
				import.meta.env.VITE_APP_URL,
			).toString();
			video.volume = 0.5;
			video.style.display = "none";
			document.body.appendChild(video);
			video.play();
			setPreviewVideo(video);
			setPlayingVideoMeme(memeName);

			// Clean up when done
			video.onended = () => {
				video.remove();
				setPreviewVideo(null);
				setPlayingVideoMeme(null);
			};
		}
	};

	const sortedAudioMemes = () => {
		// Filter out audio memes that have corresponding video versions
		const videoMemeNames = Object.keys(MEME_VIDEO);
		return Object.keys(MEME_AUDIO)
			.filter((name) => !videoMemeNames.includes(name))
			.sort();
	};

	const sortedVideoMemes = () => {
		return Object.keys(MEME_VIDEO).sort();
	};

	return (
		<div
			ref={setModal}
			class="fixed bottom-20 left-1/2 -translate-x-1/2 w-[90vw] sm:w-[800px] sm:max-w-[90vw] max-h-[80vh] flex flex-col bg-black/80 border border-white/20 rounded-lg shadow-2xl pointer-events-auto backdrop-blur-lg z-[100]"
		>
			{/* Header with tabs */}
			<div class="flex items-center justify-between border-b border-white/20 p-2 sm:p-3 shrink-0">
				<div class="flex gap-1 sm:gap-2">
					<button
						type="button"
						onClick={() => Settings.meme.tab.set("emoji")}
						class="px-2 sm:px-3 py-1 sm:py-1.5 rounded flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm transition-colors cursor-pointer"
						classList={{
							"bg-white/20 text-white": activeTab() === "emoji",
							"hover:bg-white/10 text-white/60": activeTab() !== "emoji",
						}}
					>
						<span class="icon-[mdi--emoticon-happy] w-4 h-4" />
						Emoji
					</button>
					<button
						type="button"
						onClick={() => Settings.meme.tab.set("audio")}
						class="px-2 sm:px-3 py-1 sm:py-1.5 rounded flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm transition-colors cursor-pointer"
						classList={{
							"bg-white/20 text-white": activeTab() === "audio",
							"hover:bg-white/10 text-white/60": activeTab() !== "audio",
						}}
					>
						<span class="icon-[mdi--music] w-4 h-4" />
						Audio
					</button>
					<button
						type="button"
						onClick={() => Settings.meme.tab.set("video")}
						class="px-2 sm:px-3 py-1 sm:py-1.5 rounded flex items-center gap-1 sm:gap-1.5 text-xs sm:text-sm transition-colors cursor-pointer"
						classList={{
							"bg-white/20 text-white": activeTab() === "video",
							"hover:bg-white/10 text-white/60": activeTab() !== "video",
						}}
					>
						<span class="icon-[mdi--video] w-4 h-4" />
						Video
					</button>
				</div>
				<div class="flex items-center gap-2">
					{/* Playing indicator */}
					<Show when={previewAudio() || previewVideo()}>
						<div class="bg-green-600 text-white text-xs px-2 py-1 rounded animate-pulse flex items-center gap-1">
							<span class="icon-[mdi--volume-high] w-3 h-3" />
							<span>Preview</span>
						</div>
					</Show>
					<button
						type="button"
						onClick={props.onClose}
						class="p-1 hover:bg-white/10 rounded transition-colors cursor-pointer text-white"
						aria-label="Close"
					>
						<span class="icon-[mdi--close]" />
					</button>
				</div>
			</div>

			{/* Content area */}
			<div class="p-2 sm:p-3 overflow-y-auto flex-1 custom-scrollbar" onWheel={(e) => e.stopPropagation()}>
				{/* Emoji Grid */}
				<Show when={activeTab() === "emoji"}>
					<div class="space-y-4">
						<For each={Object.entries(EMOJI_CATEGORIES)}>
							{([category, emojis]) => (
								<div>
									<div class="text-xs text-white/40 uppercase tracking-wider mb-2">{category}</div>
									<div class="flex flex-wrap gap-1">
										<For each={emojis}>
											{(emoji) => (
												<button
													type="button"
													onClick={() => insertEmoji(emoji)}
													class="w-10 h-10 hover:bg-white/10 rounded transition-colors text-xl cursor-pointer flex items-center justify-center"
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
					<div class="flex flex-wrap gap-2">
						<For each={sortedAudioMemes()}>
							{(meme) => {
								const memeData = MEME_AUDIO[meme as keyof typeof MEME_AUDIO];
								const isPlaying = () => playingAudioMeme() === meme;
								return (
									<div class="group relative bg-white/10 hover:bg-white/20 rounded p-3 transition-colors cursor-pointer basis-34 flex-grow">
										<button
											type="button"
											onClick={() => sendMeme(meme)}
											class="w-full text-left text-sm truncate text-white cursor-pointer flex items-center gap-2"
											title={`Send /${meme}`}
										>
											<span class="text-lg">{memeData.emoji}</span>
											<span>/{meme}</span>
										</button>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												previewMeme(meme, "audio");
											}}
											class="absolute right-2 top-1/2 -translate-y-1/2 p-1 bg-white/20 hover:bg-white/30 rounded transition-opacity cursor-pointer"
											classList={{
												"opacity-100": isPlaying(),
												"opacity-0 group-hover:opacity-100": !isPlaying(),
											}}
											title={isPlaying() ? "Stop" : "Preview"}
										>
											<Show
												when={isPlaying()}
												fallback={<span class="icon-[mdi--play] w-4 h-4 text-white" />}
											>
												<span class="icon-[mdi--pause] w-4 h-4 text-white" />
											</Show>
										</button>
									</div>
								);
							}}
						</For>
					</div>
				</Show>

				{/* Video Memes Grid */}
				<Show when={activeTab() === "video"}>
					<div class="flex flex-wrap gap-2">
						<For each={sortedVideoMemes()}>
							{(meme) => {
								const memeData = MEME_VIDEO[meme as MemeVideoName];
								const thumbnailName = memeData.file.replace(/\.(webm|mp4)$/, ".png");
								const isPlaying = () => playingVideoMeme() === meme;
								return (
									<div class="group relative bg-white/10 hover:bg-white/20 rounded overflow-hidden transition-colors cursor-pointer aspect-video basis-42 flex-grow">
										{/* Thumbnail background */}
										<img
											src={new URL(
												`/meme/${thumbnailName}`,
												import.meta.env.VITE_APP_URL,
											).toString()}
											alt={meme}
											class="absolute inset-0 w-full h-full opacity-30"
											style={{
												"object-fit": memeData.fit || "contain",
												"object-position": memeData.position || "center",
											}}
										/>
										{/* Video preview when playing */}
										<Show when={isPlaying()}>
											<video
												src={new URL(
													`/meme/${memeData.file}`,
													import.meta.env.VITE_APP_URL,
												).toString()}
												autoplay
												muted
												class="absolute inset-0 w-full h-full opacity-70"
												style={{
													"object-fit": memeData.fit,
													"object-position": memeData.position,
												}}
											/>
										</Show>
										<button
											type="button"
											onClick={() => sendMeme(meme)}
											class="relative z-10 w-full h-full flex items-center justify-center p-3 cursor-pointer"
											title={`Send /${meme}`}
										>
											<span class="text-sm text-white font-medium text-center drop-shadow-lg">
												/{meme}
											</span>
										</button>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												previewMeme(meme, "video");
											}}
											class="absolute right-2 bottom-2 z-20 p-1 bg-white/20 hover:bg-white/30 rounded transition-opacity cursor-pointer"
											classList={{
												"opacity-100": isPlaying(),
												"opacity-0 group-hover:opacity-100": !isPlaying(),
											}}
											title={isPlaying() ? "Stop" : "Preview"}
										>
											<Show
												when={isPlaying()}
												fallback={<span class="icon-[mdi--play] w-4 h-4 text-white" />}
											>
												<span class="icon-[mdi--pause] w-4 h-4 text-white" />
											</Show>
										</button>
									</div>
								);
							}}
						</For>
					</div>
				</Show>
			</div>
		</div>
	);
}
