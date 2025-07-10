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

        # Cross-compilation configurations
        crossSystems = {
          x86_64 = "x86_64-unknown-linux-gnu";
          aarch64 = "aarch64-unknown-linux-gnu";
        };

        # Helper function to create cross-compiled package
        makeCrossPackage =
          targetSystem: targetTriple:
          let
            crossPkgs = import nixpkgs {
              inherit system;
              crossSystem = {
                config = targetTriple;
                system = targetSystem;
              };
            };

            crossRust =
              with fenix.packages.${system};
              combine [
                stable.rustc
                stable.cargo
                stable.clippy
                stable.rustfmt
              ];

            crossNaersk = naersk.lib.${system}.override {
              cargo = crossRust;
              rustc = crossRust;
            };
          in
          crossNaersk.buildPackage {
            src = ./..;
            cargoBuildOptions = opts: opts ++ [ "--package hang-api" ];
            target = targetTriple;
          };

        # Build packages for each target
        hang-api-x86_64 = makeCrossPackage "x86_64" crossSystems.x86_64;
        hang-api-aarch64 = makeCrossPackage "aarch64" crossSystems.aarch64;

        # Helper function to create Docker image for a specific system
        makeDockerImage =
          targetPackage: imageTag:
          pkgs.dockerTools.buildImage {
            name = "hang-api";
            tag = imageTag;
            copyToRoot = pkgs.buildEnv {
              name = "hang-api-root";
              paths = [ targetPackage ];
            };
            config.Cmd = [ "/bin/hang-api" ];
          };

        # Create Docker images with correctly compiled binaries
        hang-api-docker-x86_64 = makeDockerImage hang-api-x86_64 "x86_64";
        hang-api-docker-aarch64 = makeDockerImage hang-api-aarch64 "aarch64";

        # Default package and Docker image for current system
        hang-api = makeCrossPackage system crossSystems.${system} or crossSystems.x86_64;
        hang-api-docker = makeDockerImage hang-api "latest";

      in
      {
        packages = {
          default = hang-api;
          docker = hang-api-docker;
          # Multi-arch Docker packages with properly cross-compiled binaries
          "docker-x86_64" = hang-api-docker-x86_64;
          "docker-aarch64" = hang-api-docker-aarch64;
          # Individual cross-compiled packages
          "x86_64" = hang-api-x86_64;
          "aarch64" = hang-api-aarch64;
        };

        devShell = pkgs.mkShell {
          packages = [
            (
              with fenix.packages.${system};
              combine [
                stable.rustc
                stable.cargo
                stable.clippy
                stable.rustfmt
              ]
            )
            pkgs.just
            pkgs.pkg-config
            pkgs.cargo-sort
            pkgs.cargo-shear
            pkgs.cargo-audit
            pkgs.postgresql
            pkgs.sqlx-cli
          ];
        };
      }
    );
}
