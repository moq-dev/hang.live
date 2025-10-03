import Layout from "./layout/web";

export default function Privacy() {
	return (
		<Layout>
			<div class="max-w-4xl mx-auto px-6 py-12">
				<h1 class="text-3xl font-bold mb-8">Privacy Policy</h1>
				<p class="text-sm text-gray-600 mb-8">Last Updated: October 2, 2025</p>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Philosophy</h2>
					<p>
						We believe in the right to privacy.
						Have fun and be weird; you're not being judged (by us at least).
					</p>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">What We Collect</h2>
					<p class="mb-4">We collect minimal information to provide our service:</p>
					<ul class="list-disc pl-6 space-y-2">
						<li>
							<strong>Account Information</strong>: When you sign in with a linked provider (ex. Google, Discord, or Apple), we store
							your email address, display name, and avatar. You can replace your name and avatar at any time.
						</li>
						<li>
							<strong>Session State</strong>: An authentication token and any user preferences are stored in your browser's local storage. It is cleared when you log out.
						</li>
						<li>
							<strong>Media Cache</strong>: We cache seconds worth of media to improve the playback experience. It is cleared immediately after disconnecting.
						</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">What We Don't Collect</h2>
					<p class="mb-4">We do not:</p>
					<ul class="list-disc pl-6 space-y-2">
						<li>Store any video/audio/conversations</li>
						<li>Collect payment or billing information</li>
						<li>Track your activity or collect analytics</li>
						<li>Use cookies for tracking or advertising</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">How We Use Your Information</h2>
					<p class="mb-4">Your account information is used to:</p>
					<ul class="list-disc pl-6 space-y-2">
						<li>Identify you when you're logged in</li>
						<li>Display your name/avatar to other participants</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Data Storage</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>Account information is stored securely on our servers</li>
						<li>Authentication tokens are stored locally in your browser</li>
						<li>Video/audio is cached in RAM for a few seconds</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Third-Party Authentication</h2>
					<p>
						We use Google, Discord, and Apple for sign-in. When you authenticate, you're subject to their
						privacy policies. We only receive basic profile information with your consent.
					</p>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Data Sharing</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>We do not sell, rent, or share your information</li>
						<li>We do not display ads or work with advertisers</li>
						<li>We only disclose information if required by law</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Hang Privacy</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>All hangs are public to anyone with the URL</li>
						<li>Do not share sensitive information in hangs</li>
						<li>We do not monitor or moderate content</li>
						<li>You control who can join by managing URL access</li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Your Rights</h2>
					<ul class="list-disc pl-6 space-y-2">
						<li>Delete your account from the <a href="/account" class="text-blue-400 hover:underline">account settings page</a></li>
						<li>Logout or clear browser storage to remove any local state</li>
						<li>Request a copy of your stored information by contacting <a href="mailto:admin@hang.live">admin@hang.live</a></li>
					</ul>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Changes to This Policy</h2>
					<p>We'll notify users via email of significant policy changes.</p>
				</section>

				<section class="mb-8">
					<h2 class="text-2xl font-semibold mb-4 underline decoration-link-hue underline-offset-2">Contact</h2>
					<p>For questions: <a href="mailto:admin@hang.live">admin@hang.live</a></p>
				</section>
			</div>
		</Layout>
	)
}
