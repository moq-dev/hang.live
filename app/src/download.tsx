import { createSignal, type JSX, onMount } from "solid-js";
import Layout from "./layout/web";

import aarch64AppleDarwin from "./version/apple/aarch64.json";
import x86_64AppleDarwin from "./version/apple/x86_64.json";

interface PlatformInfo {
	name: string;
	icon: string;
	download?: string;
	archLabel?: string;
}

interface NavigatorUAData {
	brands: Array<{ brand: string; version: string }>;
	mobile: boolean;
	platform: string;
}

function detectPlatform(): string {
	const userAgent = navigator.userAgent.toLowerCase();

	if (userAgent.includes("mac")) return "macOS";
	if (userAgent.includes("win")) return "Windows";
	if (userAgent.includes("linux")) return "Linux";

	return "Windows"; // Default fallback
}

async function detectMacArch(): Promise<"aarch64" | "x86_64" | "unknown"> {
	try {
		// Try using the User-Agent Client Hints API
		if ("userAgentData" in navigator && navigator.userAgentData) {
			const ua = navigator.userAgentData as NavigatorUAData & {
				getHighEntropyValues: (hints: string[]) => Promise<{ architecture?: string }>;
			};
			if (typeof ua.getHighEntropyValues === "function") {
				const values = await ua.getHighEntropyValues(["architecture"]);
				if (values.architecture) {
					// arm or arm64 indicates Apple Silicon
					if (values.architecture.toLowerCase().includes("arm")) {
						return "aarch64";
					}
					// x86 or x86_64 indicates Intel
					if (values.architecture.toLowerCase().includes("x86")) {
						return "x86_64";
					}
				}
			}
		}
	} catch {
		// API not supported or failed
	}

	return "unknown";
}

function DownloadButton(props: { platform: PlatformInfo; isPrimary?: boolean; isDetectedArch?: boolean }) {
	const href = props.platform.download || "#";
	const isAvailable = !!props.platform.download;

	const buttonContent = (
		<>
			<span class={`${props.platform.icon} ${props.isPrimary ? "text-xl" : "text-lg"}`} />
			<span>
				{props.platform.name}
				{props.platform.archLabel && <span class="text-sm opacity-80"> ({props.platform.archLabel})</span>}
			</span>
			{!isAvailable && (
				<span class="ml-auto bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded font-normal">Coming Soon</span>
			)}
		</>
	);

	if (!isAvailable) {
		return (
			<div
				class={
					props.isPrimary
						? "flex items-center gap-3 bg-gray-700 text-gray-400 px-6 py-4 rounded-lg font-semibold opacity-60 cursor-not-allowed"
						: "flex items-center gap-2 bg-gray-800 text-gray-500 px-4 py-3 rounded-lg opacity-60 cursor-not-allowed"
				}
				title="Coming soon"
			>
				{buttonContent}
			</div>
		);
	}

	return (
		<a
			href={href}
			class={
				props.isPrimary && props.isDetectedArch
					? "flex items-center gap-3 bg-blue-600 hover:bg-blue-700 text-white px-6 py-4 rounded-lg font-semibold transition-colors"
					: "flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-4 py-3 rounded-lg transition-colors"
			}
			style="text-decoration: none;"
		>
			{buttonContent}
		</a>
	);
}

export function Download(): JSX.Element {
	const [detectedArch, setDetectedArch] = createSignal<"aarch64" | "x86_64" | "unknown">("unknown");
	const currentPlatform = detectPlatform();

	onMount(async () => {
		if (currentPlatform === "macOS") {
			const arch = await detectMacArch();
			setDetectedArch(arch);
		}
	});

	const allPlatforms: PlatformInfo[] = [
		{
			name: "macOS",
			icon: "icon-[mdi--apple]",
			download: aarch64AppleDarwin.url_dmg,
			archLabel: "Apple Silicon",
		},
		{
			name: "macOS",
			icon: "icon-[mdi--apple]",
			download: x86_64AppleDarwin.url_dmg,
			archLabel: "Intel",
		},
		{
			name: "Windows",
			icon: "icon-[mdi--microsoft-windows]",
		},
		{
			name: "Linux",
			icon: "icon-[mdi--linux]",
		},
	];

	const mobile: PlatformInfo[] = [
		{
			name: "iOS",
			icon: "icon-[mdi--apple]",
		},
		{
			name: "Android",
			icon: "icon-[mdi--android]",
		},
	];

	let primary: PlatformInfo[] = [];
	let other: PlatformInfo[] = [];

	if (currentPlatform === "macOS") {
		primary = allPlatforms.filter((p) => p.name === "macOS");
		other = allPlatforms.filter((p) => p.name !== "macOS");
	} else if (currentPlatform === "Windows") {
		primary = allPlatforms.filter((p) => p.name === "Windows");
		other = allPlatforms.filter((p) => p.name !== "Windows");
	} else if (currentPlatform === "Linux") {
		primary = allPlatforms.filter((p) => p.name === "Linux");
		other = allPlatforms.filter((p) => p.name !== "Linux");
	} else {
		// Default: show Windows first
		primary = allPlatforms.filter((p) => p.name === "Windows");
		other = allPlatforms.filter((p) => p.name !== "Windows");
	}

	return (
		<Layout>
			<div class="px-4 max-w-4xl mx-auto">
				{/* Header with icon on left, text on right */}
				<div class="flex items-center gap-4 sm:gap-8 mb-4 sm:mb-12">
					<img src="/image/icon-default.svg" alt="Hang app icon" class="w-28 h-28 flex-shrink-0" />
					<div>
						<p class="text-4xl font-bold">Download the app</p>
						<p class="text-gray-400 text-md">for sick bonus features that don't work on web browsers</p>
					</div>
				</div>

				{/* Primary Platform Section */}
				<div class="mb-12">
					<h2 class="text-2xl font-semibold mb-6 underline decoration-link-hue underline-offset-4">
						{currentPlatform}
					</h2>
					<div class="flex flex-wrap gap-4">
						{primary.map((platform) => {
							const isDetected =
								currentPlatform === "macOS" &&
								((detectedArch() === "aarch64" && platform.archLabel === "Apple Silicon") ||
									(detectedArch() === "x86_64" && platform.archLabel === "Intel"));

							return (
								<DownloadButton
									platform={platform}
									isPrimary={currentPlatform === "macOS"}
									isDetectedArch={isDetected}
								/>
							);
						})}
					</div>
				</div>

				{/* Mobile Section */}
				<div class="mb-12">
					<h2 class="text-2xl font-semibold mb-6 underline decoration-link-hue underline-offset-4">Mobile</h2>
					<div class="flex flex-wrap gap-4">
						{mobile.map((platform) => (
							<div
								class="flex items-center gap-3 bg-gray-700 text-gray-400 px-6 py-4 rounded-lg font-semibold opacity-60 cursor-not-allowed"
								title="Coming soon"
							>
								<span class={`${platform.icon} text-xl`} />
								<span>{platform.name}</span>
								<span class="ml-auto bg-gray-600 text-gray-300 text-xs px-2 py-1 rounded font-normal">
									Coming Soon
								</span>
							</div>
						))}
					</div>
				</div>

				{/* Other Platforms Section */}
				{other.length > 0 && (
					<div class="mb-12">
						<h2 class="text-2xl font-semibold mb-6 underline decoration-link-hue underline-offset-4">
							Other
						</h2>
						<div class="flex flex-wrap gap-4">
							{other.map((platform) => (
								<DownloadButton platform={platform} isPrimary={false} isDetectedArch={false} />
							))}
						</div>
					</div>
				)}
			</div>
		</Layout>
	);
}
