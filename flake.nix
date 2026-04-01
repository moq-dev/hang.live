{
  # Pre-built moq binaries so you don't have to compile from source.
  # Run `cachix use kixelated` to avoid the trust prompt.
  nixConfig = {
    extra-substituters = [ "https://kixelated.cachix.org" ];
    extra-trusted-public-keys = [ "kixelated.cachix.org-1:CmFcV0lyM6KuVM2m9mih0q4SrAa0XyCsiM7GHrz3KKk=" ];
  };

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

          ];
        };

		# Keep the old attribute for backwards compatibility
        devShell = self.devShells.${system}.default;
      }
    );
}
