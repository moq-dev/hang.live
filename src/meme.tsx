import Settings from "./settings";

const SOUNDS = {
	amongUs: "/meme/among-us.mp3",
	aww: "/meme/aww.mp3",
	beRightBack: "/meme/be-right-back.mp3",
	bluetooth: "/meme/bluetooth.mp3",
	bonk: "/meme/bonk.mp3",
	bruh: "/meme/bruh.mp3",
	checkMark: "/meme/check-mark.mp3",
	checkout: "/meme/checkout.mp3",
	danger: "/meme/danger.mp3",
	disappear: "/meme/disappear.mp3",
	discord: "/meme/discord.mp3",
	error: "/meme/error.mp3",
	fbi: "/meme/fbi.mp3",
	fartReverb: "/meme/fart-reverb.mp3",
	helloThere: "/meme/hello-there.mp3",
	hubIntro: "/meme/hub-intro.mp3",
	huh: "/meme/huh.mp3",
	incorrect: "/meme/incorrect.mp3",
	knock: "/meme/knock.mp3",
	meow: "/meme/meow.mp3",
	metalPipe: "/meme/metal-pipe.mp3",
	mlg: "/meme/mlg.mp3",
	nut: "/meme/nut.mp3",
	oof: "/meme/oof.mp3",
	piuw: "/meme/piuw.mp3",
	ps2: "/meme/ps2.mp3",
	quack: "/meme/quack.mp3",
	rizz: "/meme/rizz.mp3",
	spooky: "/meme/spooky.mp3",
	suspense: "/meme/suspense.mp3",
	uwu: "/meme/uwu.mp3",
	violin: "/meme/violin.mp3",
	vine: "/meme/vine.mp3",
	wow: "/meme/wow.mp3",
	yay: "/meme/yay.mp3",
} as const;

const VIDEOS = {
	huh: "/meme/huh.webm",
	maxwell: "/meme/maxwell.webm",
	oiia: "/meme/oiia.webm",
} as const;

export type MemeSound = keyof typeof SOUNDS;
export type MemeVideo = keyof typeof VIDEOS;

// NOTE: We don't cache elements because the browser will.
// Otherwise it would be a pain in the butt to manage if the same meme is played simultaneously.
export function loadMeme(name: string): HTMLAudioElement | HTMLVideoElement | undefined {
	const videoPath = VIDEOS[name as MemeVideo];
	const audioPath = SOUNDS[name as MemeSound];
	console.log("videoPath", videoPath, "audioPath", audioPath);

	// Use the video if it's available, unless the user has potato mode enabled and would prefer audio.
	if (videoPath && (!audioPath || !Settings.potato.peek())) {
		const video = document.createElement("video") as HTMLVideoElement;
		video.src = videoPath;
		video.autoplay = true;
		video.load();
		return video;
	}

	if (audioPath) {
		const audio = new Audio(audioPath);
		audio.autoplay = true;
		audio.load();
		return audio;
	}

	return undefined;
}
