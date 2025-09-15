import { type JSX } from "solid-js";
import Layout from "./layout/web";

interface PlatformInfo {
	name: string;
	icon: string;
	downloadLink: string;
}

function detectPlatform(): string {
	const userAgent = navigator.userAgent.toLowerCase();

	if (userAgent.includes("mac")) return "macOS";
	if (userAgent.includes("win")) return "Windows";
	if (userAgent.includes("linux")) return "Linux";

	return "Windows"; // Default fallback
}

function getPlatformInfo(): { current: PlatformInfo; others: PlatformInfo[] } {
	const currentPlatform = detectPlatform();

	const platforms: Record<string, PlatformInfo> = {
		Windows: {
			name: "Windows",
			icon: "icon-[mdi--microsoft-windows]",
			downloadLink: "#windows-download",
		},
		macOS: {
			name: "macOS",
			icon: "icon-[mdi--apple]",
			downloadLink: "#macos-download",
		},
		Linux: {
			name: "Linux",
			icon: "icon-[mdi--linux]",
			downloadLink: "#linux-download",
		},
	};

	const current = platforms[currentPlatform];
	const others = Object.values(platforms).filter((p) => p.name !== currentPlatform);

	return { current, others };
}

export function Download(): JSX.Element {
	const { current, others } = getPlatformInfo();

	return (
		<Layout>
			<div class="px-4 max-w-4xl mx-auto">
				{/* Header with icon on left, text on right */}
				<div class="flex items-center gap-4 sm:gap-8 mb-4 sm:mb-12">
					<img src="/image/icon.svg" alt="Hang app icon" class="w-28 h-28 flex-shrink-0" />
					<div>
						<p class="text-4xl font-bold">
							<a href={current.downloadLink}>Download the app</a>
						</p>
						<p class="text-gray-400 text-md">For sick bonus features that don't work on web browsers.</p>
					</div>
				</div>

				<div class="mb-12">
					<h2 class="text-2xl font-semibold mb-6 underline decoration-link-hue underline-offset-4">Mobile</h2>
					<div class="flex flex-wrap gap-4">
						<a
							href="#ios-download"
							class="flex items-center gap-3 bg-gray-700 hover:bg-gray-600 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
							style="text-decoration: none;"
						>
							<span class="icon-[mdi--apple] text-xl" />
							iOS
						</a>
						<a
							href="#android-download"
							class="flex items-center gap-3 bg-gray-700 hover:bg-gray-600 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
							style="text-decoration: none;"
						>
							<span class="icon-[mdi--android] text-xl" />
							Android
						</a>
					</div>
				</div>

				{/* Desktop Downloads - Flex Row with Wrap */}
				<div class="mb-12">
					<h2 class="text-2xl font-semibold mb-6 underline decoration-link-hue underline-offset-4">
						Desktop
					</h2>
					<div class="flex flex-wrap gap-4">
						{/* Current Platform - Prominent */}
						<a
							href={current.downloadLink}
							class="flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
							style="text-decoration: none;"
						>
							<span class={`${current.icon} text-xl`} />
							{current.name}
						</a>

						{/* Other Desktop Platforms */}
						{others.map((platform) => (
							<a
								href={platform.downloadLink}
								class="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-4 py-3 rounded-lg transition-colors"
								style="text-decoration: none;"
							>
								<span class={`${platform.icon} text-lg`} />
								{platform.name}
							</a>
						))}
					</div>
				</div>
			</div>
		</Layout>
	);
}
