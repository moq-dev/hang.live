{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShell = pkgs.mkShell {
          nativeBuildInputs = with pkgs; [
            pkg-config
            cargo
            cargo-tauri
            nodejs_22
            pnpm
            typescript
          ];

          buildInputs = with pkgs; [
            openssl_3
          ];

          shellHook = ''
            echo "Frontend + Tauri dev environment loaded!"
            echo "Node: $(node --version) | pnpm: $(pnpm --version) | TypeScript: $(tsc --version)"
          '';
        };
      }
    );
}
