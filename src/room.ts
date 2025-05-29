import { Connection, Watch } from "@kixelated/hang"
import { Signal, Signals, signal } from "@kixelated/signals"
import { Broadcast } from "./broadcast"
import { Vector } from "./vector"
import { Bounds } from "./bounds"

const PADDING = 64

export type RoomProps = {
	visible?: boolean
	volume?: number
	muted?: boolean
}

export class Room {
	// The connection to the server.
	// This is reactive; it may still be pending.
	connection: Connection

	// All of the broadcasts keyed by their path.
	// We use the insertion order to determine the z-index.
	#broadcasts = new Map<string, Broadcast>();

	// The broadcasts that have been closed and are fading away.
	#rip: Broadcast[] = [];

	canvas: HTMLCanvasElement

	#ctx: CanvasRenderingContext2D
	#animation: number | undefined

	#hovering?: Broadcast
	#dragging?: Broadcast
	#scale = 1.0;

	// When true, the AudioContext is suspended so we can't even visualize audio.
	// I really don't understand why browsers do this.
	suspended: Signal<boolean>

	// When true, no audio will be emitted.
	muted: Signal<boolean>

	// The volume of the audio being emitted.
	volume: Signal<number>

	// When false, no video will be downloaded or rendered.
	visible: Signal<boolean>

	// The last volume that was set.
	// This is used to restore the volume on unmute.
	#unmuteVolume = 0.5

	#signals = new Signals();

	constructor(connection: Connection, canvas: HTMLCanvasElement, props?: RoomProps) {
		this.connection = connection
		this.canvas = canvas
		this.muted = signal(props?.muted ?? false)
		this.visible = signal(props?.visible ?? true)
		this.volume = signal(props?.volume ?? 0.5)

		// Check if the user needs to click the page to unmute the audio.
		// TODO do this in a UI element.
		this.suspended = signal((() => {
			const ctx = new AudioContext()
			const suspended = ctx.state === "suspended"
			ctx.close()
			return suspended
		})())

		const ctx = this.canvas.getContext("2d")
		if (!ctx) {
			throw new Error("Failed to get canvas context")
		}

		this.#ctx = ctx

		this.canvas.addEventListener("resize", () => { })

		this.canvas.addEventListener("mousedown", (e) => {
			const rect = this.canvas.getBoundingClientRect()
			const mouse = Vector.create(e.clientX - rect.left, e.clientY - rect.top).mult(window.devicePixelRatio)

			this.#dragging = this.#broadcastAt(mouse)
			if (!this.#dragging) return

			// Reinsert to update the z-index.
			const name = this.#dragging.watch.path.peek()
			if (name) {
				this.#broadcasts.delete(name)
				this.#broadcasts.set(name, this.#dragging)
			}

			this.canvas.style.cursor = "grabbing"
		})

		this.canvas.addEventListener("mousemove", (e) => {
			const rect = this.canvas.getBoundingClientRect()
			const mouse = Vector.create(e.clientX - rect.left, e.clientY - rect.top).mult(window.devicePixelRatio)

			if (this.#dragging) {
				this.#dragging.targetPosition = Vector.create(
					mouse.x / this.canvas.width,
					mouse.y / this.canvas.height,
				)
			} else {
				this.#hovering = this.#broadcastAt(mouse)
				if (this.#hovering) {
					this.canvas.style.cursor = "grab"
				} else {
					this.canvas.style.cursor = "default"
				}
			}
		})

		this.canvas.addEventListener("mouseup", () => {
			if (this.#dragging) {
				this.#dragging = undefined
				this.#hovering = undefined
				this.canvas.style.cursor = "default"
			}
		})

		this.canvas.addEventListener("mouseleave", () => {
			if (this.#dragging) {
				this.#dragging = undefined
				this.#hovering = undefined
				this.canvas.style.cursor = "default"
			}
		})

		this.canvas.addEventListener(
			"wheel",
			(e) => {
				e.preventDefault() // Prevent scroll

				let broadcast = this.#dragging
				if (!broadcast) {
					const rect = this.canvas.getBoundingClientRect()
					const mouse = Vector.create(e.clientX - rect.left, e.clientY - rect.top).mult(
						window.devicePixelRatio,
					)

					broadcast = this.#broadcastAt(mouse)
					if (!broadcast) return

					this.#hovering = broadcast
				}

				const scale = e.deltaY * 0.001
				if (scale < 0) {
					this.canvas.style.cursor = "zoom-out"
				} else if (scale > 0) {
					this.canvas.style.cursor = "zoom-in"
				}

				broadcast.targetScale = Math.max(Math.min(broadcast.targetScale + scale, 4), 0.25)
			},
			{ passive: false },
		)

		// Only render the canvas when it's visible.
		this.#signals.effect(() => {
			const visible = this.visible.get()
			if (!visible) return

			this.#animation = requestAnimationFrame(this.#tick.bind(this))
			return () => cancelAnimationFrame(this.#animation ?? 0)
		})

		// Apply the visible signal to the broadcasts.
		this.#signals.effect(() => {
			const visible = this.visible.get()

			for (const broadcast of this.#broadcasts.values()) {
				broadcast.watch.video.enabled.set(visible)
			}
		})

		// Apply the muted signal to the broadcasts.
		// NOTE: We don't pause audio so we still get visualizations.
		this.#signals.effect(() => {
			const muted = this.muted.get()
			for (const broadcast of this.#broadcasts.values()) {
				broadcast.audio.muted.set(muted)
			}
		})

		// Don't download audio if the AudioContext is suspended.
		this.#signals.effect(() => {
			const suspended = this.suspended.get()
			for (const broadcast of this.#broadcasts.values()) {
				broadcast.audio.source.enabled.set(!suspended)
			}
		})

		// Set the volume to 0 when muted.
		this.#signals.effect(() => {
			const muted = this.muted.get()
			if (muted) {
				this.#unmuteVolume = this.volume.peek() || 0.5
				this.volume.set(0)
			} else {
				this.volume.set(this.#unmuteVolume)
			}
		})

		// Set unmute when the volume is non-zero.
		this.#signals.effect(() => {
			const volume = this.volume.get()
			this.muted.set(volume === 0)
		})

		this.#signals.effect(() => this.#init())
	}

	#init() {
		const connection = this.connection.established.get()
		if (!connection) return

		const announced = connection.announced();

		(async () => {
			for (; ;) {
				const update = await announced.next()

				// We're donezo.
				if (!update) break

				if (update.active) {
					this.#startBroadcast(update.path)
				} else {
					this.#stopBroadcast(update.path)
				}
			}

			for (const broadcast of this.#broadcasts.values()) {
				broadcast.close()
			}

			this.#broadcasts.clear()
		})()

		return () => {
			announced.close()
		}
	}

	#broadcastAt(point: Vector) {
		// We need to iterate in reverse order to respect the z-index.
		// TODO: Short-circuit on the first result, but that requires a reverse iterator.
		let result: Broadcast | undefined

		for (const broadcast of this.#broadcasts.values()) {
			if (broadcast.bounds.contains(point)) {
				result = broadcast
			}
		}

		return result
	}

	#startBroadcast(name: string) {
		// Start them at the center of the screen with a tiiiiny bit of variance.
		const targetPosition = Vector.create(0.5 + ((Math.random() - 0.5) ** 4), 0.5 + ((Math.random() - 0.5) ** 4))

		// We haven't received their initial position yet, so we'll just put them somewhere offscreen.
		// This gives us a bit of time to start loading stuff and looks cool.
		const offset = Vector.create(targetPosition.x - 0.5, targetPosition.y - 0.5)
			.normalize()
			.mult(Math.sqrt(this.canvas.width ** 2 + this.canvas.height ** 2))

		// Follow the unit vector of the target position and go outside the screen.
		const startPosition = Vector.create(
			targetPosition.x * this.canvas.width,
			targetPosition.y * this.canvas.height,
		).add(offset)

		const watch = new Watch.Broadcast(this.connection, {
			path: name,
			reload: false,
			// Download video unless the window is hidden.
			video: { enabled: this.visible.peek() },
			// Download audio unless the AudioContext is suspended.
			audio: { enabled: !this.suspended.peek() },
			location: { enabled: true }
		})

		const broadcast = new Broadcast(watch)
		broadcast.targetPosition = targetPosition
		broadcast.bounds.position = startPosition

		// This should never happen, but just in case.
		const old = this.#broadcasts.get(name)
		if (old) {
			console.warn(`Broadcast already exists: ${name}`)
			old.close()
		}

		this.#broadcasts.set(name, broadcast)
	}

	#stopBroadcast(path: string) {
		const broadcast = this.#broadcasts.get(path)

		// TODO Fix the relay so it doesn't do this.
		if (!broadcast) {
			console.warn(`Broadcast not found: ${path}`)
			return
		}

		this.#broadcasts.delete(path)
		this.#rip.push(broadcast)

		// Follow the unit vector of the target position and go outside the screen.
		const half = Vector.create(0.5, 0.5)
		broadcast.targetPosition = broadcast.targetPosition.sub(half).normalize().mult(2).add(half)

		// Slowly fade out the offline broadcast.
		const fade = () => {
			broadcast.online -= 0.01

			if (broadcast.online <= 0) {
				this.#rip.splice(this.#rip.indexOf(broadcast), 1)
			} else {
				requestAnimationFrame(fade)
			}
		}

		requestAnimationFrame(fade)
	}

	#tick(now: DOMHighResTimeStamp) {
		this.#updateScale()

		const bounds = new Bounds(Vector.create(0, 0), Vector.create(this.canvas.width, this.canvas.height))

		for (const broadcast of this.#rip) {
			broadcast.tick(now, bounds, this.#scale)
			broadcast.update(bounds)
		}

		const broadcasts = Array.from(this.#broadcasts.values())
		for (const broadcast of broadcasts) {
			broadcast.tick(now, bounds, this.#scale)
		}

		// Check for collisions.
		// We might need to optimize this with a quadtree or something.
		for (let i = 0; i < broadcasts.length; i++) {
			const a = broadcasts[i]

			for (let j = i + 1; j < broadcasts.length; j++) {
				const b = broadcasts[j]

				// Compute the intersection rectangle.
				const intersection = a.bounds.intersects(b.bounds)
				if (!intersection) {
					continue
				}

				// Repel each other based on the size of the intersection.
				const strength = (2 * intersection.area()) / (a.bounds.area() + b.bounds.area())
				let force = a.bounds.middle().sub(b.bounds.middle()).mult(strength)

				if (this.#dragging !== a && this.#dragging !== b) {
					force = force.mult(10)
				}

				a.velocity = a.velocity.add(force)
				b.velocity = b.velocity.sub(force)
			}

			const above = PADDING - a.bounds.position.y
			const below = a.bounds.position.y + a.bounds.size.y - (this.canvas.height - PADDING)
			const left = PADDING - a.bounds.position.x
			const right = a.bounds.position.x + a.bounds.size.x - (this.canvas.width - PADDING)

			if (above > 0) {
				if (below > 0) {
					// Do nothing, this element is huge.
				} else {
					a.velocity.y += above
				}
			} else if (below > 0) {
				a.velocity.y -= below
			}

			if (left > 0) {
				if (right > 0) {
					// Do nothing, this element is huge.
				} else {
					a.velocity.x += left
				}
			} else if (right > 0) {
				a.velocity.x -= right
			}
		}

		// Finally, apply the velocity to the position.
		for (const broadcast of broadcasts) {
			broadcast.update(bounds)
		}

		this.#render()

		this.#animation = requestAnimationFrame(this.#tick.bind(this))
	}

	#render() {
		const ctx = this.#ctx
		ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)

		for (const broadcast of this.#broadcasts.values()) {
			ctx.save()
			broadcast.audio.render(ctx, broadcast.bounds, broadcast.scale)
			ctx.restore()
		}

		for (const broadcast of this.#rip) {
			ctx.save()
			ctx.globalAlpha *= broadcast.online // Fade the opacity when the broadcaster is offline.
			broadcast.video.render(ctx, broadcast.bounds, broadcast.scale)
			ctx.restore()
		}

		for (const broadcast of this.#broadcasts.values()) {
			if (this.#dragging !== broadcast) {
				ctx.save()
				broadcast.video.render(ctx, broadcast.bounds, broadcast.scale, {
					hovering: this.#hovering === broadcast,
				})
				ctx.restore()
			}
		}

		// Render the dragging broadcast last so it's on top.
		if (this.#dragging) {
			ctx.save()
			ctx.fillStyle = "rgba(0, 0, 0, 0.5)"
			this.#dragging.video.render(ctx, this.#dragging.bounds, this.#dragging.scale, { dragging: true })
			ctx.restore()
		}
	}

	#updateScale() {
		const canvasArea = this.canvas.width * this.canvas.height

		let broadcastArea = 0
		for (const broadcast of this.#broadcasts.values()) {
			broadcastArea += broadcast.targetSize.x * broadcast.targetSize.y
		}

		const fillRatio = broadcastArea / canvasArea
		const targetFill = 0.25

		this.#scale = Math.sqrt(targetFill / fillRatio)
	}

	close() {
		this.#signals.close()

		for (const broadcast of this.#broadcasts.values()) {
			broadcast.close()
		}

		for (const broadcast of this.#rip) {
			broadcast.close()
		}

		this.#rip = []
		this.#broadcasts.clear()
	}
}
