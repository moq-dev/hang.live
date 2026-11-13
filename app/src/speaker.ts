import * as Signals from "@moq/signals";

/** The speaker slider and stored gain share this range. */
export const VOLUME_RANGE = { min: 0, max: 2, step: 0.01 };

function validVolume(value: number): boolean {
	return Number.isFinite(value) && value >= VOLUME_RANGE.min && value <= VOLUME_RANGE.max;
}

/** Load speaker gain and mute, persisting changes until the effect closes. */
export function load(
	storage: Pick<Storage, "getItem" | "setItem">,
	effect: Signals.Effect,
): { enabled: Signals.Signal<boolean>; volume: Signals.Signal<number>; setVolume(value: number): void } {
	const raw = storage.getItem("settings.audio.volume");
	let initial = raw?.trim() ? Number(raw) : 1;
	if (!validVolume(initial)) initial = 1;

	// Zero represents mute; keep an audible gain for the next unmute.
	const enabled = new Signals.Signal(
		storage.getItem("settings.audio.enabled") !== "false" && initial !== VOLUME_RANGE.min,
	);
	const volume = new Signals.Signal(initial === VOLUME_RANGE.min ? 1 : initial);

	effect.subscribe(volume, (value) => storage.setItem("settings.audio.volume", value.toString()));
	effect.subscribe(enabled, (value) => storage.setItem("settings.audio.enabled", value.toString()));

	return {
		enabled,
		volume,
		setVolume(value: number): void {
			if (!validVolume(value)) return;
			if (value === VOLUME_RANGE.min) {
				enabled.set(false);
			} else {
				volume.set(value);
				enabled.set(true);
			}
		},
	};
}
