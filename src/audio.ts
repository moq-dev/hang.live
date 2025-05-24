import { cleanup, signal, Signal, Signals } from "@kixelated/signals"
import { Watch } from "@kixelated/hang"
import { Bounds } from "./bounds"
import { createEffect } from "solid-js"

export type AudioProps = {
	muted?: boolean
	volume?: number
	pan?: number
}

export class Audio {
	// We don't use the Audio emitter that comes with hang so we can do cool audio effects.
	source: Watch.Audio
	muted: Signal<boolean>
	volume: Signal<number>
	pan: Signal<number>

	#gain = signal<GainNode | undefined>(undefined)
	#left?: AnalyserNode
	#right?: AnalyserNode

	#signals = new Signals();

	constructor(source: Watch.Audio, props?: AudioProps) {
		this.source = source
		this.muted = signal(props?.muted ?? false)
		this.volume = signal(props?.volume ?? 1)
		this.pan = signal(props?.pan ?? 0)

		this.#signals.effect(() => this.#init())
	}

	#init() {
		this.#left = undefined
		this.#right = undefined

		const audio = this.source.root.get()
		if (!audio) return

		const { context, node } = audio

		if (node.channelCount < 2) {
			const analyzer = new AnalyserNode(context, { fftSize: 256 })

			node.connect(analyzer)
			node.connect(context.destination) // output to the speakers

			this.#left = analyzer
			this.#right = analyzer

			return cleanup(() => {
				analyzer.disconnect()
			})
		}

		const gain = new GainNode(context, { gain: this.volume.peek() })
		createEffect(() => {
			// Update the gain when the volume changes.
			gain.gain.value = this.muted.get() ? 0 : this.volume.get()
		})

		const audioPanner = new StereoPannerNode(context, {
			channelCount: node.channelCount,
			pan: this.pan.peek(),
		})

		createEffect(() => {
			// Update the pan when the pan changes.
			audioPanner.pan.value = this.pan.get()
		})

		node.connect(gain)
		gain.connect(audioPanner)
		audioPanner.connect(context.destination)

		const splitter = new ChannelSplitterNode(context, {
			channelCount: node.channelCount,
			numberOfOutputs: 2,
		})

		const audioLeft = new AnalyserNode(context, { fftSize: 256 })
		const audioRight = new AnalyserNode(context, { fftSize: 256 })

		// We analyze pre-gain so we can see the audio even when muted.
		node.connect(splitter)
		splitter.connect(audioLeft, 0)
		splitter.connect(audioRight, 1)

		this.#left = audioLeft
		this.#right = audioRight
		this.#gain.set(gain)

		return () => {
			gain.disconnect()
			this.#gain.set(undefined)

			audioLeft.disconnect()
			audioRight.disconnect()
			splitter.disconnect()
			audioPanner.disconnect()
		}
	}

	render(ctx: CanvasRenderingContext2D, bounds: Bounds, scale: number) {
		if (!this.#left || !this.#right) {
			return
		}

		ctx.translate(bounds.position.x, bounds.position.y)

		// Round down the height to the nearest power of 2.
		const bars = Math.max(2 ** Math.floor(Math.log2(bounds.size.y / 4)), 32)
		const barHeight = bounds.size.y / bars
		const barData = new Uint8Array(bars) // TODO reuse a buffer.
		const barScale = 8 * scale

		this.#left.fftSize = bars
		this.#left.getByteFrequencyData(barData)

		for (let i = 0; i < bars / 2; i++) {
			const power = barData[i] / 255
			const hue = 2 ** power * 100 + 135
			const barWidth = 4 ** power * barScale

			ctx.fillStyle = `hsla(${hue}, 80%, 40%, ${power})`
			ctx.fillRect(-barWidth, bounds.size.y / 2 - (i + 1) * barHeight, barWidth, barHeight + 0.1)
			ctx.fillRect(-barWidth, bounds.size.y / 2 + i * barHeight, barWidth, barHeight + 0.1)
		}

		this.#right.fftSize = bars
		this.#right.getByteFrequencyData(barData)

		for (let i = 0; i < bars / 2; i++) {
			const power = barData[i] / 255
			const hue = 2 ** power * 100 + 135
			const barWidth = 4 ** power * barScale

			ctx.fillStyle = `hsla(${hue}, 80%, 40%, ${power})`
			ctx.fillRect(bounds.size.x, bounds.size.y / 2 - (i + 1) * barHeight, barWidth, barHeight + 0.1)
			ctx.fillRect(bounds.size.x, bounds.size.y / 2 + i * barHeight, barWidth, barHeight + 0.1)
		}
	}

	close() {
		this.#signals.close()
		this.source.close()
	}
}
