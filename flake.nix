{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShell = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            pkg-config
            cargo
            cargo-tauri
            cargo-sort
            cargo-shear
            cargo-edit
            nodejs
            pnpm
            just
            # Icon generation tools
            imagemagick
            libicns  # provides png2icns
          ];
        };
      }
    );
}
