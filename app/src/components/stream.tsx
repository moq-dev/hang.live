import { createMemo, createSignal, For, onCleanup, Show } from "solid-js";
import type { JSX } from "solid-js/jsx-runtime";
import * as Api from "../api";
import type { Room } from "../room";
import * as Stream from "../stream";
import { solid } from "../util/solid";
import Tooltip from "./tooltip";

type Minted = { external: Stream.External; expires: Date };

/** A button opening the settings and commands to stream into or out of the room from OBS or the CLI. */
export function StreamButton(props: { name: string; room: Room }): JSX.Element {
	const [open, setOpen] = createSignal(false);
	const [minted, setMinted] = createSignal<Minted | undefined>(undefined);
	const [error, setError] = createSignal<string | undefined>(undefined);

	// Keep the tokens while they last, so reopening shows the identity OBS was already given.
	const show = async () => {
		setOpen(true);
		setError(undefined);
		const current = minted();
		if (current && current.expires.getTime() > Date.now()) return;

		setMinted(undefined);
		try {
			const response = await Api.client.routes.room[":room"].external.$post({ param: { room: props.name } });
			if (!response.ok) throw new Error(response.statusText || `HTTP ${response.status}`);
			const external = await response.json();
			setMinted({ external, expires: new Date(Date.now() + external.lifetime * 1000) });
		} catch (err) {
			console.error("Failed to mint stream tokens", err);
			setError(err instanceof Error ? err.message : String(err));
		}
	};

	return (
		<>
			<Tooltip content="Stream from OBS or the CLI" position="top">
				<button
					type="button"
					onClick={show}
					aria-label="Stream from OBS or the CLI"
					aria-haspopup="dialog"
					class="hover:bg-gray-700 transition-all cursor-pointer p-2 pointer-events-auto backdrop-blur-sm bg-transparent rounded"
				>
					<span class="icon-[mdi--video-input-antenna]" />
				</button>
			</Tooltip>

			<Show when={open()}>
				<div
					class="fixed inset-0 bg-black/60 flex items-center justify-center z-[1002] pointer-events-auto"
					onClick={() => setOpen(false)}
					onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
					role="dialog"
					aria-label="Stream from OBS or the CLI"
					tabIndex={-1}
				>
					<div
						class="max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto bg-black/90 backdrop-blur-xl rounded-xl border border-white/20 shadow-2xl p-5 text-base leading-normal"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => e.stopPropagation()}
						role="document"
					>
						<div class="flex items-center justify-between mb-4">
							<h2 class="text-lg font-semibold">Stream from OBS or the CLI</h2>
							<button
								type="button"
								onClick={() => setOpen(false)}
								class="p-1 text-gray-400 hover:text-white cursor-pointer"
								aria-label="Close"
							>
								<span class="icon-[mdi--close]" />
							</button>
						</div>
						<Show when={error()}>
							{(error) => (
								<div role="alert" class="text-red-400">
									Couldn't create stream tokens: {error()}
								</div>
							)}
						</Show>
						<Show
							when={minted()}
							fallback={
								<Show when={!error()}>
									<div class="text-gray-400">Creating tokens...</div>
								</Show>
							}
						>
							{(minted) => <Details minted={minted()} room={props.room} />}
						</Show>
					</div>
				</div>
			</Show>
		</>
	);
}

function Details(props: { minted: Minted; room: Room }): JSX.Element {
	const external = () => props.minted.external;
	const ingest = createMemo(() => Stream.ingest(external()));

	// Anyone on screen, the local tiles included, can be recorded or restreamed.
	const ordered = solid(props.room.space.ordered);
	const paths = createMemo(() => ordered().map((broadcast) => broadcast.path));
	const [picked, setPicked] = createSignal<string | undefined>(undefined);
	const target = createMemo(() => {
		const pick = picked();
		return pick && paths().includes(pick) ? pick : paths()[0];
	});

	return (
		<div class="flex flex-col gap-5">
			<section class="flex flex-col gap-2">
				<h3 class="font-semibold">Stream in</h3>
				<p class="text-sm text-gray-400">
					In OBS's MoQ dock or moq-studio, enter this relay URL and broadcast. Your stream joins the hang as
					its own tile.
				</p>
				<Copy label="Relay URL" value={Stream.url(external().relay, external().publish)} />
				<Copy label="Broadcast" value={Stream.broadcast(external())} />
				<Copy label="Camera and microphone" value={ingest().capture} />
				<Copy label="IP camera (RTSP)" value={ingest().rtsp} />
			</section>

			<section class="flex flex-col gap-2">
				<h3 class="font-semibold">Record or restream</h3>
				<Show when={target()} fallback={<p class="text-sm text-gray-400">Nobody is broadcasting yet.</p>}>
					{(path) => {
						const egress = createMemo(() => Stream.egress(external(), path()));
						return (
							<>
								<label class="text-sm text-gray-400 flex items-center gap-2">
									Broadcast
									<select
										class="bg-gray-900 border border-white/20 rounded px-2 py-1 text-white"
										value={path()}
										onChange={(e) => setPicked(e.currentTarget.value)}
									>
										<For each={paths()}>{(path) => <option value={path}>{path}</option>}</For>
									</select>
								</label>
								<Copy label="Serve HLS on port 8089" value={egress().hls} />
								<Copy label="Restream over RTMP" value={egress().rtmp} />
								<Copy label="Record to MP4" value={egress().mp4} />
							</>
						);
					}}
				</Show>
			</section>

			<p class="text-sm text-gray-400">
				Install the CLI with <code>curl -fsSL https://moq.sh | sh</code>. These tokens work until{" "}
				{props.minted.expires.toLocaleTimeString()}; anyone holding them can stream into or watch this hang.
			</p>
		</div>
	);
}

function Copy(props: { label: string; value: string }): JSX.Element {
	const [copied, setCopied] = createSignal<"copied" | "failed" | undefined>(undefined);
	let timer: ReturnType<typeof setTimeout> | undefined;
	onCleanup(() => clearTimeout(timer));

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(props.value);
			setCopied("copied");
		} catch (err) {
			// Denied permission or an insecure context; say so instead of claiming success.
			console.error("Failed to copy", err);
			setCopied("failed");
		}
		clearTimeout(timer);
		timer = setTimeout(() => setCopied(undefined), 2000);
	};

	return (
		<div class="flex flex-col gap-1">
			<span class="text-xs text-gray-400">{props.label}</span>
			<div class="flex items-start gap-2">
				<code class="flex-1 min-w-0 break-all bg-gray-900 rounded px-2 py-1 text-xs font-mono select-all">
					{props.value}
				</code>
				<button
					type="button"
					onClick={copy}
					class="p-1 text-gray-400 hover:text-white cursor-pointer"
					aria-label={`Copy ${props.label}`}
					title={copied() === "failed" ? "Couldn't copy, select the text instead" : "Copy"}
				>
					<span
						classList={{
							"icon-[mdi--check] text-green-400": copied() === "copied",
							"icon-[mdi--alert] text-red-400": copied() === "failed",
							"icon-[mdi--content-copy]": copied() === undefined,
						}}
					/>
				</button>
			</div>
		</div>
	);
}
