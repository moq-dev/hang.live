const DEFAULTS = 50;

export function getDefaultAvatar() {
	const index = Math.floor(Math.random() * DEFAULTS);
	return `${index}.svg`;
}
