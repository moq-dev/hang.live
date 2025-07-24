import * as rpc from "./rpc";

export const router = rpc.router().get("/", async (c) => {
	return c.json({
		status: "ok",
		timestamp: new Date().toISOString(),
		version: "0.0.1",
	});
});
