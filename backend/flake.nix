{
  description = "Hang API Service - Rust development environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };
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
        overlays = [ (import rust-overlay) ];
        pkgs = import nixpkgs {
          inherit system overlays;
        };

        # Rust toolchain matching rust-toolchain.toml
        rustToolchain = pkgs.rust-bin.stable."1.75.0".default.override {
          extensions = [
            "rust-src"
            "rust-analyzer"
          ];
        };

        # PostgreSQL data directory
        pgDataDir = "./.postgres-data";
        pgPort = "5432";
        pgDatabase = "hang_db";
        pgUser = "hang_user";
        pgPassword = "hang_password";

        # Scripts for managing PostgreSQL
        startPostgres = pkgs.writeShellScriptBin "start-postgres" ''
          set -e

          if [ ! -d "${pgDataDir}" ]; then
            echo "Initializing PostgreSQL database..."
            ${pkgs.postgresql}/bin/initdb -D ${pgDataDir} --auth-local=trust --auth-host=md5
            echo "host all all 127.0.0.1/32 md5" >> ${pgDataDir}/pg_hba.conf
            echo "listen_addresses = 'localhost'" >> ${pgDataDir}/postgresql.conf
            echo "port = ${pgPort}" >> ${pgDataDir}/postgresql.conf
          fi

          echo "Starting PostgreSQL..."
          ${pkgs.postgresql}/bin/pg_ctl -D ${pgDataDir} -l ${pgDataDir}/logfile start

          # Wait for PostgreSQL to start
          until ${pkgs.postgresql}/bin/pg_isready -h localhost -p ${pgPort}; do
            echo "Waiting for PostgreSQL..."
            sleep 1
          done

          # Create user and database if they don't exist
          if ! ${pkgs.postgresql}/bin/psql -h localhost -p ${pgPort} -U $USER -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname='${pgUser}'" | grep -q 1; then
            echo "Creating user ${pgUser}..."
            ${pkgs.postgresql}/bin/psql -h localhost -p ${pgPort} -U $USER -d postgres -c "CREATE USER ${pgUser} WITH PASSWORD '${pgPassword}' CREATEDB;"
          fi

          if ! ${pkgs.postgresql}/bin/psql -h localhost -p ${pgPort} -U $USER -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='${pgDatabase}'" | grep -q 1; then
            echo "Creating database ${pgDatabase}..."
            ${pkgs.postgresql}/bin/psql -h localhost -p ${pgPort} -U $USER -d postgres -c "CREATE DATABASE ${pgDatabase} OWNER ${pgUser};"
          fi

          echo "PostgreSQL is ready at localhost:${pgPort}"
          echo "Database: ${pgDatabase}"
          echo "User: ${pgUser}"
          echo "Password: ${pgPassword}"
        '';

        stopPostgres = pkgs.writeShellScriptBin "stop-postgres" ''
          echo "Stopping PostgreSQL..."
          ${pkgs.postgresql}/bin/pg_ctl -D ${pgDataDir} stop || true
        '';

        resetPostgres = pkgs.writeShellScriptBin "reset-postgres" ''
          echo "Resetting PostgreSQL..."
          ${stopPostgres}/bin/stop-postgres
          rm -rf ${pgDataDir}
          ${startPostgres}/bin/start-postgres
        '';

        # Development environment variables
        devEnv = pkgs.writeShellScriptBin "dev-env" ''
          export DATABASE_URL="postgresql://${pgUser}:${pgPassword}@localhost:${pgPort}/${pgDatabase}"
          export JWT_SECRET="dev-jwt-secret-change-in-production"
          export GOOGLE_CLIENT_ID="your-google-client-id"
          export GOOGLE_CLIENT_SECRET="your-google-client-secret"
          export BASE_URL="http://localhost:3001"
          export STORAGE_TYPE="local"
          export STORAGE_LOCAL_PATH="./uploads"
          export PORT="3001"
          export RUST_LOG="hang_api=debug,tower_http=debug"

          echo "Environment variables set for development"
          echo "DATABASE_URL=$DATABASE_URL"
          echo "BASE_URL=$BASE_URL"
          echo "STORAGE_TYPE=$STORAGE_TYPE"
        '';

      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = with pkgs; [
            # Rust toolchain
            rustToolchain

            # System dependencies for building Rust crates
            pkg-config
            openssl
            libpq # PostgreSQL client library

            # PostgreSQL server
            postgresql

            # Development tools
            just
            sqlx-cli

            # Helper scripts
            startPostgres
            stopPostgres
            resetPostgres
            devEnv

            # Optional: useful tools
            curl
            jq
          ];

          shellHook = ''
            echo "🦀 Hang API Development Environment"
            echo ""
            echo "Available commands:"
            echo "  start-postgres  - Start PostgreSQL server"
            echo "  stop-postgres   - Stop PostgreSQL server"
            echo "  reset-postgres  - Reset PostgreSQL database"
            echo "  dev-env         - Set development environment variables"
            echo ""
            echo "Quick start:"
            echo "  1. start-postgres"
            echo "  2. eval \$(dev-env)"
            echo "  3. cargo run"
            echo ""

            # Set up development environment by default
            eval $(dev-env)
          '';

          # Environment variables for the shell
          DATABASE_URL = "postgresql://${pgUser}:${pgPassword}@localhost:${pgPort}/${pgDatabase}";
          RUST_LOG = "hang_api=debug,tower_http=debug";
        };

        packages = {
          inherit
            startPostgres
            stopPostgres
            resetPostgres
            devEnv
            ;

          # Build the API service
          hang-api = pkgs.rustPlatform.buildRustPackage {
            pname = "hang-api";
            version = "0.1.0";

            src = ./.;

            cargoLock = {
              lockFile = ./Cargo.lock;
            };

            nativeBuildInputs = with pkgs; [
              pkg-config
            ];

            buildInputs =
              with pkgs;
              [
                openssl
                libpq
              ]
              ++ pkgs.lib.optionals pkgs.stdenv.isDarwin [
                pkgs.darwin.apple_sdk.frameworks.Security
                pkgs.darwin.apple_sdk.frameworks.SystemConfiguration
              ];

            # Copy migrations to the output
            postInstall = ''
              mkdir -p $out/share/migrations
              cp -r migrations/* $out/share/migrations/
            '';
          };
        };

        # For running with nix run
        apps.default = flake-utils.lib.mkApp {
          drv = self.packages.${system}.hang-api;
        };
      }
    );
}
