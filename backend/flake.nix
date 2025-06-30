{
  inputs = {
    fenix.url = "github:nix-community/fenix";
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    naersk.url = "github:nmattia/naersk";
  };

  outputs =
    {
      self,
      fenix,
      nixpkgs,
      flake-utils,
      naersk,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };

        rust =
          with fenix.packages.${system};
          combine [
            stable.rustc
            stable.cargo
            stable.clippy
            stable.rustfmt
          ];

        naersk' = naersk.lib.${system}.override {
          cargo = rust;
          rustc = rust;
        };

        common-deps = [
          rust
          pkgs.just
          pkgs.pkg-config
          pkgs.cargo-sort
          pkgs.cargo-shear
          pkgs.cargo-audit
        ];

      in
      {
        packages = {
          default = naersk'.buildPackage {
            src = ./.;
          };
        };

        devShells.default = pkgs.mkShell {
          packages = common-deps ++ [
            pkgs.postgresql
            pkgs.sqlx-cli
          ];
        };
      }
    );
}
