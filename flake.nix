{
  description = "hang.live development environment";

  nixConfig = {
    extra-substituters = [ "https://nix.moq.dev" ];
    extra-trusted-public-keys = [
      "nix.moq.dev-1:BZ0DtCypDFv1ESX3hxuB42yc0vitSA1YHojSmVwB5bk="
    ];
    fallback = true;
  };

  inputs = {
    moq.url = "github:moq-dev/moq/28d8eb84d640c2db6b516e1a1115c34400975787";
    nixpkgs.follows = "moq/nixpkgs";
    flake-utils.follows = "moq/flake-utils";
    # Quest's CLI, which serves the guide and the skills its stubs call.
    # Bump the tag, then rerun `quest init`.
    quest = {
      url = "github:kixel-ai/quest";
      inputs.nixpkgs.follows = "nixpkgs";
      inputs.flake-utils.follows = "flake-utils";
      # Its own nixpkgs pin only supplies Bun, which ours already matches; following
      # ours skips fetching a second nixpkgs on every cold shell (~15s in CI).
      inputs.nixpkgs-bun.follows = "nixpkgs";
    };
  };

  outputs =
    {
      nixpkgs,
      flake-utils,
      moq,
      quest,
      ...
    }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
        # The browser tests launch only full Chromium.
        PLAYWRIGHT_BROWSERS_PATH = "${
          pkgs.playwright-driver.browsers.override {
            withFirefox = false;
            withWebkit = false;
            withChromiumHeadlessShell = false;
          }
        }";
      in
      {
        devShells.default = pkgs.mkShell {
          inherit PLAYWRIGHT_BROWSERS_PATH;
          nativeBuildInputs = with pkgs; [
            bun
            just
            rsync
            git-lfs
            quest.packages.${system}.default
            moq.packages.${system}.moq-relay
            moq.packages.${system}.moq
          ];
        };
        # Only what `just smoke` needs, all from cache.nixos.org, for a runner that cannot use nix.moq.dev.
        devShells.smoke = pkgs.mkShell {
          inherit PLAYWRIGHT_BROWSERS_PATH;
          nativeBuildInputs = with pkgs; [
            bun
            just
          ];
        };
      }
    );
}
