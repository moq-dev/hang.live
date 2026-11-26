import DOMPurify, { type WindowLike } from "dompurify";

// Tags marked emits for text formatting. Nothing that fetches a resource (img, video, audio, source,
// picture, iframe), since every peer renders the message and a fetch would reveal their IP address.
const ALLOWED_TAGS = [
	"a",
	"b",
	"blockquote",
	"br",
	"code",
	"del",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"i",
	"li",
	"ol",
	"p",
	"pre",
	"s",
	"strong",
	"table",
	"tbody",
	"td",
	"th",
	"thead",
	"tr",
	"ul",
];

// No `style` (CSS `url()` fetches too) and no `target`/`rel` from the peer; links get ours below.
const ALLOWED_ATTR = ["href", "title"];

// Absolute web and mail links only.
const ALLOWED_URI_REGEXP = /^(?:https?|mailto):/i;

// Build a sanitizer over the given window: untrusted chat HTML in, a fragment out that loads nothing
// and opens links safely.
export function sanitizer(window: WindowLike): (html: string) => DocumentFragment {
	// A private instance, so these hooks never apply to any other DOMPurify use.
	const purify = DOMPurify(window);
	// DOMPurify returns its input untouched on an unsupported DOM; refuse instead.
	if (!purify.isSupported) throw new Error("DOMPurify is not supported in this environment");

	purify.addHook("afterSanitizeAttributes", (node) => {
		if (node.tagName === "A" && node.hasAttribute("href")) {
			node.setAttribute("target", "_blank");
			node.setAttribute("rel", "noopener noreferrer");
		}
	});

	return (html) =>
		purify.sanitize(html, {
			ALLOWED_TAGS,
			ALLOWED_ATTR,
			ALLOWED_URI_REGEXP,
			RETURN_DOM_FRAGMENT: true,
		});
}

// Whether a peer's avatar URL may be loaded: only from the app itself (the bundled defaults) or the public
// bucket the API copies uploads and provider avatars into. Any other host would learn every viewer's IP.
export function avatar(url: string, origins: { app: string; public: string }): boolean {
	let parsed: URL;
	try {
		// Relative paths resolve against the app, as an <img> would.
		parsed = new URL(url, origins.app);
	} catch {
		return false;
	}
	if (parsed.origin === new URL(origins.app).origin) return true;
	// Compare the normalized URL against the bucket path, so `public.example.com.evil.com` and `..` don't slip by.
	const bucket = origins.public.replace(/\/+$/, "");
	return parsed.href.startsWith(`${bucket}/avatar/`);
}
