{
  description = "Top-level flake delegating to frontend and backend";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    # frontend.url = "./frontend";
    backend.url = "./backend";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
      # frontend,
      backend,
      ...
    }:
    flake-utils.lib.eachDefaultSystem (system: {
      devShells.default = nixpkgs.legacyPackages.${system}.mkShell {
        inputsFrom = [
          # frontend.devShells.${system}.default
          backend.devShells.${system}.default
        ];
      };
    });
}
