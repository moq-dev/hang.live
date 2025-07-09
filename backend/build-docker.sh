#!/bin/bash

set -euo pipefail

# Configuration
PROJECT_ID="${PROJECT_ID:-}"
REGISTRY="${REGISTRY:-gcr.io}"
IMAGE_NAME="${IMAGE_NAME:-api}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
BUILD_METHOD="${BUILD_METHOD:-docker}" # docker or nix

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

usage() {
    cat << EOF
Usage: $0 [OPTIONS]

Build and push Docker images for hang-api

OPTIONS:
    -p, --project PROJECT_ID    GCP Project ID (required)
    -r, --registry REGISTRY     Container registry (default: gcr.io)
    -i, --image IMAGE_NAME      Image name (default: api)
    -t, --tag IMAGE_TAG         Image tag (default: latest)
    -m, --method BUILD_METHOD   Build method: docker or nix (default: docker)
    -h, --help                  Show this help message

EXAMPLES:
    # Build and push using Docker
    $0 -p my-project -m docker

    # Build and push using Nix
    $0 -p my-project -m nix

    # Build multi-arch with Docker
    $0 -p my-project -m docker --multi-arch

ENVIRONMENT VARIABLES:
    PROJECT_ID      GCP Project ID
    REGISTRY        Container registry
    IMAGE_NAME      Image name
    IMAGE_TAG       Image tag
    BUILD_METHOD    Build method (docker or nix)
EOF
}

# Parse command line arguments
MULTI_ARCH=false
while [[ $# -gt 0 ]]; do
    case $1 in
        -p|--project)
            PROJECT_ID="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            shift 2
            ;;
        -i|--image)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -t|--tag)
            IMAGE_TAG="$2"
            shift 2
            ;;
        -m|--method)
            BUILD_METHOD="$2"
            shift 2
            ;;
        --multi-arch)
            MULTI_ARCH=true
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            error "Unknown option: $1"
            ;;
    esac
done

# Validate required parameters
if [[ -z "$PROJECT_ID" ]]; then
    error "PROJECT_ID is required. Use -p or set PROJECT_ID environment variable."
fi

if [[ "$BUILD_METHOD" != "docker" && "$BUILD_METHOD" != "nix" ]]; then
    error "BUILD_METHOD must be 'docker' or 'nix'"
fi

# Construct full image name
FULL_IMAGE_NAME="${REGISTRY}/${PROJECT_ID}/${IMAGE_NAME}:${IMAGE_TAG}"

log "Building container image: $FULL_IMAGE_NAME"
log "Build method: $BUILD_METHOD"

# Check if required tools are available
check_requirements() {
    case $BUILD_METHOD in
        docker)
            if ! command -v docker &> /dev/null; then
                error "Docker is not installed or not in PATH"
            fi
            ;;
        nix)
            if ! command -v nix &> /dev/null; then
                error "Nix is not installed or not in PATH"
            fi
            ;;
    esac

    if ! command -v gcloud &> /dev/null; then
        warn "gcloud is not installed. You may need to authenticate manually."
    fi
}

# Authenticate with GCP
authenticate_gcp() {
    log "Authenticating with Google Cloud..."

    if command -v gcloud &> /dev/null; then
        gcloud auth configure-docker gcr.io --quiet
        log "Docker configured for GCR"
    else
        warn "gcloud not found. Please authenticate with GCR manually."
    fi
}

# Build with Docker
build_docker() {
    log "Building with Docker..."

    if [[ "$MULTI_ARCH" == "true" ]]; then
        log "Building multi-architecture image..."

        # Create and use buildx builder
        docker buildx create --use --name multiarch --driver docker-container 2>/dev/null || true

        # Build and push multi-arch image
        docker buildx build \
            --platform linux/amd64,linux/arm64 \
            --push \
            --tag "$FULL_IMAGE_NAME" \
            .
    else
        log "Building single-architecture image..."

        # Build image
        docker build -t "$FULL_IMAGE_NAME" .

        # Push image
        docker push "$FULL_IMAGE_NAME"
    fi
}

# Build with Nix
build_nix() {
    log "Building with Nix..."

    if [[ "$MULTI_ARCH" == "true" ]]; then
        log "Building multi-architecture images with Nix..."

        # Build for different architectures
        log "Building for x86_64..."
        nix build .#docker-x86_64 --no-link

        log "Building for aarch64..."
        nix build .#docker-aarch64 --no-link

        # Load and push images
        log "Loading and pushing x86_64 image..."
        nix build .#docker-x86_64 --no-link --print-out-paths | xargs -I {} docker load -i {}
        docker tag hang-api:latest "${FULL_IMAGE_NAME}-amd64"
        docker push "${FULL_IMAGE_NAME}-amd64"

        log "Loading and pushing aarch64 image..."
        nix build .#docker-aarch64 --no-link --print-out-paths | xargs -I {} docker load -i {}
        docker tag hang-api:latest "${FULL_IMAGE_NAME}-arm64"
        docker push "${FULL_IMAGE_NAME}-arm64"

        # Create and push manifest
        log "Creating multi-arch manifest..."
        docker manifest create "$FULL_IMAGE_NAME" \
            "${FULL_IMAGE_NAME}-amd64" \
            "${FULL_IMAGE_NAME}-arm64"
        docker manifest push "$FULL_IMAGE_NAME"
    else
        log "Building single-architecture image with Nix..."

        # Build image
        nix build .#docker --no-link

        # Load and push image
        log "Loading and pushing image..."
        nix build .#docker --no-link --print-out-paths | xargs -I {} docker load -i {}
        docker tag hang-api:latest "$FULL_IMAGE_NAME"
        docker push "$FULL_IMAGE_NAME"
    fi
}

# Main execution
main() {
    check_requirements
    authenticate_gcp

    case $BUILD_METHOD in
        docker)
            build_docker
            ;;
        nix)
            build_nix
            ;;
    esac

    log "Successfully built and pushed: $FULL_IMAGE_NAME"
}

# Run main function
main "$@"
