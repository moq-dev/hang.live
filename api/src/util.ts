// Fails to compile when a switch misses a case, and throws if a value slips through at runtime.
export function unreachable(value: never): never {
	throw new Error(`Unreachable: ${value}`);
}
