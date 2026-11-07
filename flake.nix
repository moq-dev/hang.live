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
    moq.url = "github:moq-dev/moq/18dbfe0f1a9c92566012976f2eb2573fb795258b";
    nixpkgs.follows = "moq/nixpkgs";
    flake-utils.follows = "moq/flake-utils";
    rust-overlay.follows = "moq/rust-overlay";
    # Keep Quest's CLI, guide, and skills at the version used by MoQ.
    quest.follows = "moq/quest";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
      moq,
      quest,
    }:
    flake-utils.lib.eachSystem [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" ] (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust-overlay.overlays.default ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
          nativeBuildInputs = with pkgs; [
            cargo-sort
            cargo-shear
            cargo-edit
            cargo-tauri
            (rust-bin.stable."1.98.1".minimal.override {
              extensions = [
                "clippy"
                "rustfmt"
              ];
            })
            bun
            just
            rsync
            git-lfs
            quest.packages.${system}.default
            moq.packages.${system}.moq-relay
            moq.packages.${system}.moq
            imagemagick
            libicns
          ];
        };

        devShell = self.devShells.${system}.default;
      }
    );
}
