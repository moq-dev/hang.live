{
  # TODO: Add Android build support https://nixos.wiki/wiki/Android
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
        devShells.default = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            # Build tools
            cmake
            pkg-config
			#android-tools

            # Native app tooling
            cargo-tauri

            # Additional build dependencies that might be needed
            gcc
            binutils
          ];

        };
      }
    );
}
