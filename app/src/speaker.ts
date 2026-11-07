import * as Signals from "@moq/signals";

export const VOLUME_RANGE = { min: 0, max: 2, step: 0.01 };

function validVolume(value: number): boolean {
	return Number.isFinite(value) && value >= VOLUME_RANGE.min && value <= VOLUME_RANGE.max;
}

export function load(
	storage: Pick<Storage, "getItem" | "setItem">,
	effect: Signals.Effect,
): { enabled: Signals.Signal<boolean>; volume: Signals.Signal<number>; setVolume(value: number): void } {
	const raw = storage.getItem("settings.audio.volume");
	let initial = raw?.trim() ? Number(raw) : 1;
	if (!validVolume(initial)) initial = 1;

	// A legacy zero gain is muted, with unity gain available when unmuted.
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
