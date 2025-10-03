{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
          overlays = [ rust-overlay.overlays.default ];
        };
      in
      {
        devShells.default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            cargo-sort
            cargo-shear
            cargo-edit
			cargo-tauri
            bun
            just

            # Icon generation tools
            imagemagick
            libicns  # provides png2icns
          ];
        };

		# Keep the old attribute for backwards compatibility
        devShell = self.devShells.${system}.default;
      }
    );
}
