import { Connection, Support } from "@kixelated/hang";
import { Match, Switch, createSelector } from "solid-js";
import { JSX } from "solid-js/jsx-runtime";

export function Status({ connection }: { connection: Connection }): JSX.Element {
	const url = connection.url.get;
	const status = createSelector(connection.status.get);

	return (
		<div>
			<Switch fallback={<Support.Modal show="partial" />}>
				<Match when={!url()}>🔴&nbsp;No URL</Match>
				<Match when={status("disconnected")}>🔴&nbsp;Disconnected</Match>
				<Match when={status("connecting")}>🟡&nbsp;Connecting...</Match>
			</Switch>
		</div>
	);
}
