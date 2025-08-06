export async function detectWebGPU() {
	try {
		// @ts-expect-error - navigator.gpu is not typed yet
		const adapter = await navigator.gpu.requestAdapter();
		return !!adapter;
	} catch {
		return false;
	}
}
