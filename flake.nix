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
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      moq,
      quest,
    }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          # The media check launches only full Chromium.
          PLAYWRIGHT_BROWSERS_PATH = "${
            pkgs.playwright-driver.browsers.override {
              withFirefox = false;
              withWebkit = false;
              withChromiumHeadlessShell = false;
            }
          }";
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

        devShell = self.devShells.${system}.default;
      }
    );
}
