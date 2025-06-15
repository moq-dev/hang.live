import Settings from "./settings";

const SOUNDS = {
	amongus: "among-us.mp3",
	aww: "aww.mp3",
	berightback: "be-right-back.mp3",
	bluetooth: "bluetooth.mp3",
	bonk: "bonk.mp3",
	bruh: "bruh.mp3",
	checkmark: "check-mark.mp3",
	checkout: "checkout.mp3",
	danger: "danger.mp3",
	disappear: "disappear.mp3",
	discord: "discord.mp3",
	error: "error.mp3",
	fbi: "fbi.mp3",
	fart: "fart-reverb.mp3",
	hellothere: "hello-there.mp3",
	hub: "hub-intro.mp3",
	huh: "huh.mp3",
	incorrect: "incorrect.mp3",
	knock: "knock.mp3",
	meow: "meow.mp3",
	metalpipe: "metal-pipe.mp3",
	mlg: "mlg.mp3",
	nut: "nut.mp3",
	oof: "oof.mp3",
	piuw: "piuw.mp3",
	ps2: "ps2.mp3",
	quack: "quack.mp3",
	rizz: "rizz.mp3",
	spooky: "spooky.mp3",
	suspense: "suspense.mp3",
	uwu: "uwu.mp3",
	violin: "violin.mp3",
	boom: "boom.mp3",
	wow: "wow.mp3",
	yay: "yay.mp3",
} as const;

const VIDEOS = {
	anotherone: "another-one.webm",
	momentslater: "a-few-moments-later.mp4",
	// TODO contain, not fill
	berightback: "be-right-back.webm",
	// TODO: align to bottom left, make sure top is filled
	bingchilling: "bing-chilling.webm",
	cry: "crying.webm",
	gettingawaywithit: "getting-away-with-it.webm",
	disappointment: "disappointment.webm",
	hellothere: "hello-there.webm",
	// TODO: stretch to contain, not fit
	hackerman: "hackerman.webm",
	awwshit: "aww-shit.webm",
	error: "error.webm",
	huh: "huh.webm",
	kek: "kekw.webm",
	instagram: "instagram.webm",
	maxwell: "maxwell.webm",
	nice: "nice.webm",
	oiia: "oiia.webm",
	nogodno: "no-god-no.webm",
	// TODO stretch to contain, not fit (or align to bottom left)
	continued: "continued.webm",
	reformed: "reformed.webm",
	doit: "do-it.webm",
	thick: "thick.webm",
	yeahbaby: "yeah-baby.webm",
	thuglife: "thug-life.webm",
	gigachad: "giga-chad.webm",
	okay: "okay.webm",

	// TODO: It should go over the screenshare, not the webcam, and should be in the top right corner.
	// speedrun: "speedrun.webm",
	pizzatime: "pizza-time.webm",
	stopit: "stopit.webm",
	youdied: "you-died.webm",
	realestate: "real-estate.webm",
	waw: "waw.webm",
	zzz: "zzz.webm",
} as const;

export type MemeSound = keyof typeof SOUNDS;
export type MemeVideo = keyof typeof VIDEOS;

// NOTE: We don't cache elements because the browser will.
// Otherwise it would be a pain in the butt to manage if the same meme is played simultaneously.
export function loadMeme(name: string): HTMLAudioElement | HTMLVideoElement | undefined {
	// Make the name lowercase.
	const lower = name.toLowerCase();

	const videoPath = VIDEOS[lower as MemeVideo];
	const audioPath = SOUNDS[lower as MemeSound];

	// Use the video if it's available, unless the user has potato mode enabled and would prefer audio.
	if (videoPath && (!audioPath || !Settings.potato.peek())) {
		const video = document.createElement("video") as HTMLVideoElement;
		video.src = `/meme/${videoPath}`;
		video.play();
		return video;
	}

	if (audioPath) {
		const audio = new Audio(`/meme/${audioPath}`);
		audio.autoplay = true;
		audio.load();
		return audio;
	}

	return undefined;
}
