// Random name generators
const ADJECTIVES = [
	"cozy",
	"swift",
	"bright",
	"calm",
	"happy",
	"quiet",
	"sunny",
	"cool",
	"fresh",
	"warm",
	"quick",
	"smart",
	"neat",
	"bold",
	"zen",
	"chill",
	"dank",
	"vibes",
	"based",
	"fire",
	"lit",
	"epic",
	"crisp",
	"smooth",
	"slick",
	"funky",
	"groovy",
	"retro",
	"wild",
	"rad",
	"prime",
	"elite",
	"ultra",
	"mega",
	"turbo",
	"cosmic",
	"digital",
	"cyber",
	"neon",
	"pastel",
	"dreamy",
	"fuzzy",
	"sparkly",
	"golden",
	"silver",
	"purple",
	"teal",
] as const;

const NOUNS = [
	"chat",
	"room",
	"space",
	"place",
	"hub",
	"zone",
	"spot",
	"meet",
	"talk",
	"hang",
	"desk",
	"cafe",
	"lounge",
	"studio",
	"corner",
	"nook",
	"vibe",
	"den",
	"nest",
	"cave",
	"pod",
	"dome",
	"loft",
	"deck",
	"pier",
	"grove",
	"garden",
	"tower",
	"castle",
	"bunker",
	"cabin",
	"vault",
	"portal",
	"galaxy",
	"realm",
	"dimension",
	"matrix",
	"circuit",
	"cloud",
	"stream",
	"wave",
	"echo",
	"pulse",
	"node",
	"link",
	"mesh",
	"grid",
] as const;

type NoDuplicates<T extends readonly unknown[]> = T extends readonly [infer X, ...infer Rest]
	? X extends Rest[number]
		? never
		: readonly [X, ...NoDuplicates<Rest>]
	: T;

export function room(): string {
	// Let Typescript enforce we didn't accidentally duplicate an adjective or noun.
	const adjectives: NoDuplicates<typeof ADJECTIVES> = ADJECTIVES;
	const nouns: NoDuplicates<typeof NOUNS> = NOUNS;

	const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
	const noun = nouns[Math.floor(Math.random() * nouns.length)];
	let num = Math.floor(Math.random() * 1001);
	// Yes, I did just double the chance of 69 and 420 appearing.
	if (num === 1000) num = 69;
	if (num === 1001) num = 420;
	return `${adj}-${noun}-${num}`;
}
