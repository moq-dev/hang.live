import Layout from "./layout/web";

// The privacy policy page.
export default function Privacy() {
	return (
		<Layout>
			<div class="max-w-4xl mx-auto px-6 py-12">
				<h1 class="text-3xl font-bold mb-8">Privacy Policy</h1>
				<p class="text-sm text-gray-600 mb-8">Last Updated: November 27, 2026</p>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Philosophy
					</h2>
					<p>
						We believe in the right to privacy. Have fun and be weird; you're not being judged (by us at
						least).
					</p>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						What We Collect
					</h2>
					<p class="mb-4">We collect minimal information to provide our service:</p>
					<ul class="list-disc pl-6 space-y-2">
						<li>
							<strong>Account Information</strong>: When you sign in with a linked provider (ex. Google,
							Discord, or Apple), we store your email address, display name, and avatar. You can replace
							your name and avatar at any time. We also store which providers you linked and the rooms you
							favorite.
						</li>
						<li>
							<strong>Guests</strong>: Without signing in, you join with a random guest identity, name,
							and avatar. We keep no guest record on our servers; your browser holds the credential.
						</li>
						<li>
							<strong>Browser Storage</strong>: Your sign-in token, guest identity, and preferences (such
							as your chosen camera, microphone, and volume) are stored in your browser's local storage.
							Logging out removes your sign-in token and identity; preferences stay until you clear site
							data.
						</li>
						<li>
							<strong>Relay Cache</strong>: While you're in a hang, relays keep the last 30 seconds of
							your video and audio and the last 10 seconds of chat, so late joiners can catch up. They
							keep your name and avatar for up to a day. All of it is held in memory and never recorded.
						</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						What We Don't Collect
					</h2>
					<p class="mb-4">We do not:</p>
					<ul class="list-disc pl-6 space-y-2">
						<li>Store any video/audio/conversations</li>
						<li>Collect payment or billing information</li>
						<li>Track your activity or collect analytics</li>
						<li>Use cookies for tracking or advertising</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						How We Use Your Information
					</h2>
					<p class="mb-4">Your account information is used to:</p>
					<ul class="list-disc pl-6 space-y-2">
						<li>Identify you when you're logged in</li>
						<li>Display your name/avatar to other participants</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Data Storage
					</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>Account information is stored securely on our servers</li>
						<li>Authentication tokens are stored locally in your browser</li>
						<li>Video, audio, and chat are held in relay memory for at most 30 seconds</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Third-Party Authentication
					</h2>
					<p>
						We use Google, Discord, and Apple for sign-in. When you authenticate, you're subject to their
						privacy policies. We only receive basic profile information with your consent.
					</p>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Service Providers
					</h2>
					<p class="mb-4">These services handle data on our behalf so hang.live can work:</p>
					<ul class="list-disc pl-6 space-y-2">
						<li>
							<strong>Cloudflare</strong> hosts the website and API. Account information is stored in
							Cloudflare D1 and uploaded avatars in Cloudflare R2. Cloudflare processes your requests,
							including your IP address, and our API keeps operational logs.
						</li>
						<li>
							<strong>MoQ relays</strong> (<code>cdn.moq.dev</code>) carry everything you share in a hang:
							video, audio, screen shares, chat messages, your name, and your avatar. The relays forward
							it to other participants live and keep only the relay cache described above.
						</li>
						<li>
							<strong>Hugging Face</strong> serves the speech model when you pick high-quality text to
							speech, so it sees your IP address when your browser downloads it. The speech itself is
							generated on your device.
						</li>
						<li>
							<strong>Your browser's speech engine</strong> reads participant names aloud when they join
							or leave, unless you turn text to speech off or pick high quality. Some browsers use an
							online voice that sends that text to the browser's vendor.
						</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Data Sharing
					</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>
							Everything you share in a hang, including your name and avatar, goes to everyone else in it
						</li>
						<li>We do not sell or rent your information</li>
						<li>The service providers above process it only to run hang.live</li>
						<li>We do not display ads or work with advertisers</li>
						<li>Beyond that, we only disclose information if required by law</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Hang Privacy
					</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>All hangs are public to anyone with the URL</li>
						<li>Do not share sensitive information in hangs</li>
						<li>We do not monitor or moderate content</li>
						<li>You control who can join by managing URL access</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Your Rights
					</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>
							Delete your account from the{" "}
							<a href="/account" class="text-blue-400 hover:underline">
								account settings page
							</a>
						</li>
						<li>Clear this site's data in your browser to remove everything stored locally</li>
						<li>
							Request a copy of your stored information by contacting{" "}
							<a href="mailto:admin@hang.live">admin@hang.live</a>
						</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Changes to This Policy
					</h2>
					<p>We'll post changes on this page and update the date at the top.</p>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">
						Contact
					</h2>
					<p>
						For questions: <a href="mailto:admin@hang.live">admin@hang.live</a>
					</p>
				</section>
			</div>
		</Layout>
	);
}
