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

1. Done 2026-11-25: with `fc0dc04` deployed, a guest joining a fresh
   `hang.live` room was announced to a second tab through `cdn.moq.dev`, so
   `moq.pro` accepts the current `RELAY_SECRET` and no rotation is needed.
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

- Maintainer (PC): steps 2-3 above. An agent cannot take them: the OpenTofu
  state, Linode token, and GCP credentials exist only on the maintainer's
  machine.
