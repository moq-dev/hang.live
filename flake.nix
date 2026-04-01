{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay.url = "github:oxalica/rust-overlay";
    moq = {
      url = "github:moq-dev/moq";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      rust-overlay,
      moq,
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
            rsync

            # MoQ relay and token CLI for local development
            moq.packages.${system}.moq-relay
            moq.packages.${system}.moq-token-cli

            # Icon generation tools
            imagemagick
            libicns  # provides png2icns

			# Shader validation
			glslang
          ];
        };

		# Keep the old attribute for backwards compatibility
        devShell = self.devShells.${system}.default;
      }
    );
}
