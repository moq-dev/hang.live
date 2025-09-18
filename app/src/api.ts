import * as Api from "@hang/api/client";
import * as Url from "./util/url";

export * from "@hang/api/client";

const url = Url.rewrite(import.meta.env.VITE_API_URL);
export const client = new Api.Client(url);
