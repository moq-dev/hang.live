#!/bin/bash

set -euo pipefail

# Build for different architectures
echo "Building for x86_64..."
nix build .#docker-x86_64 --no-link

echo "Building for aarch64..."
nix build .#docker-aarch64 --no-link

# Load and push images
echo "Building x86_64 image..."
nix build .#docker-x86_64 --no-link --print-out-paths | xargs -I {} docker load -i {}

echo "Building aarch64 image..."
nix build .#docker-aarch64 --no-link --print-out-paths | xargs -I {} docker load -i {}

# Create and push manifest
echo "Creating multi-arch manifest..."
docker manifest create "hang-api:latest" \
	"hang-api:x86_64" \
	"hang-api:aarch64"

echo "Created image: hang-api:latest"
