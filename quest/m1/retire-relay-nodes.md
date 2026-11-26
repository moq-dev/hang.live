# [XS] Retire the self-hosted moq.hang.live relay nodes

## Goal

Production Hang joins rooms through `moq.pro` (`cdn.moq.dev`) with a
`RELAY_SECRET` that `moq.pro` trusts, and the old self-hosted
`*.moq.hang.live` Linode relays, their publisher, and their DNS zone are torn
down.

## Plan

The repository side merged with the deletion of `infra/`; its last tree is
commit `203de18` (`git show 203de18:infra/main.tf`). OpenTofu state is local
(`infra/tofu.tfstate`, gitignored) and lives only on the maintainer's machine
that last ran `tofu apply`.

1. Verify the token key. With the current API deployed (`just deploy`), open
   `https://hang.live`, join a room as a guest, and enable the camera. Publishing and watching from a second tab must work, and
   DevTools must show the WebTransport session to `cdn.moq.dev` open without a
   `401`/`403` close. If it is rejected, rotate to a key `moq.pro` trusts:
   `npx wrangler secret put RELAY_SECRET --env live` from `api/`, then repeat
   the check.
2. Tear down the nodes from the machine holding the state:
   `git worktree add ../hang-infra 203de18`, copy `infra/tofu.tfstate`,
   `infra/terraform.tfvars`, and `infra/secrets/` into `../hang-infra/infra/`,
   then `cd ../hang-infra/infra && tofu init && tofu destroy`.
   Remove the `moq` NS delegation for the deleted Cloud DNS zone from the
   `hang.live` zone, then delete the worktree and the local `secrets/` copies.
   Delete the old checkout's untracked `infra/` (state, `terraform.tfvars`,
   `secrets/`), then remove the `/infra/` line from the root `.gitignore`.
3. Check: `dig +short moq.hang.live` and `dig +short use.moq.hang.live` print
   nothing, and the Linode dashboard lists no `use`/`usw`/`euc`/`sea`/`pub`
   instances.

## Waiting

- Maintainer (PC): steps 1-3 above. An agent cannot take them: the OpenTofu
  state, Linode token, and GCP credentials exist only on the maintainer's
  machine, and rotating `RELAY_SECRET` changes a production secret. Step 1's
  browser check could be automated by an agent driving Chrome once the
  current API is deployed; a scheduled smoke join against `hang.live` is the
  durable signal and belongs with the m1 test work.
