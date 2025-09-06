#!/bin/bash

# MarketFlow Production Deployment Script
# This script helps deploy the application using Docker images from GitHub Container Registry

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
GITHUB_REPOSITORY=""
ENV_FILE=".env.prod"
DOCKER_COMPOSE_FILE="docker-compose.prod.yml"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -r, --repository REPO    GitHub repository (owner/repo)"
    echo "  -e, --env-file FILE      Environment file (default: .env.prod)"
    echo "  -f, --compose-file FILE  Docker compose file (default: docker-compose.prod.yml)"
    echo "  -h, --help              Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 -r your-username/marketflow"
    echo "  $0 -r your-username/marketflow -e .env.production"
    echo ""
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--repository)
            GITHUB_REPOSITORY="$2"
            shift 2
            ;;
        -e|--env-file)
            ENV_FILE="$2"
            shift 2
            ;;
        -f|--compose-file)
            DOCKER_COMPOSE_FILE="$2"
            shift 2
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate required parameters
if [[ -z "$GITHUB_REPOSITORY" ]]; then
    print_error "GitHub repository is required. Use -r or --repository option."
    show_usage
    exit 1
fi

# Check if environment file exists
if [[ ! -f "$ENV_FILE" ]]; then
    print_warning "Environment file $ENV_FILE not found."
    print_status "Creating environment file from template..."
    cp env.prod.example "$ENV_FILE"
    print_warning "Please edit $ENV_FILE with your production values before running again."
    exit 1
fi

# Check if docker-compose file exists
if [[ ! -f "$DOCKER_COMPOSE_FILE" ]]; then
    print_error "Docker compose file $DOCKER_COMPOSE_FILE not found."
    exit 1
fi

# Set GitHub repository in environment
export GITHUB_REPOSITORY="$GITHUB_REPOSITORY"

print_status "Starting MarketFlow deployment..."
print_status "Repository: $GITHUB_REPOSITORY"
print_status "Environment file: $ENV_FILE"
print_status "Docker compose file: $DOCKER_COMPOSE_FILE"

# Load environment variables
print_status "Loading environment variables..."
set -a
source "$ENV_FILE"
set +a

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker and try again."
    exit 1
fi

# Login to GitHub Container Registry (optional, for private repos)
print_status "Checking GitHub Container Registry access..."
if ! docker pull "ghcr.io/$GITHUB_REPOSITORY/frontend:latest" > /dev/null 2>&1; then
    print_warning "Could not pull images. You may need to login to GitHub Container Registry:"
    print_status "Run: echo \$GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin"
fi

# Stop existing containers
print_status "Stopping existing containers..."
docker-compose -f "$DOCKER_COMPOSE_FILE" down --remove-orphans || true

# Pull latest images
print_status "Pulling latest images..."
docker-compose -f "$DOCKER_COMPOSE_FILE" pull

# Start services
print_status "Starting services..."
docker-compose -f "$DOCKER_COMPOSE_FILE" up -d

# Wait for services to be ready
print_status "Waiting for services to be ready..."
sleep 10

# Check service health
print_status "Checking service health..."

# Check backend
if curl -f http://localhost:3000/api/v1/health > /dev/null 2>&1; then
    print_success "Backend is healthy"
else
    print_warning "Backend health check failed. Check logs with: docker-compose -f $DOCKER_COMPOSE_FILE logs backend"
fi

# Check frontend
if curl -f http://localhost:80 > /dev/null 2>&1; then
    print_success "Frontend is healthy"
else
    print_warning "Frontend health check failed. Check logs with: docker-compose -f $DOCKER_COMPOSE_FILE logs frontend"
fi

# Show running containers
print_status "Running containers:"
docker-compose -f "$DOCKER_COMPOSE_FILE" ps

print_success "Deployment completed!"
print_status "Services available at:"
print_status "  Frontend: http://localhost:80"
print_status "  Backend API: http://localhost:3000/api/v1"
print_status "  API Documentation: http://localhost:3000/api/v1/docs"
print_status "  pgAdmin: http://localhost:5050"

print_status "To view logs: docker-compose -f $DOCKER_COMPOSE_FILE logs -f"
print_status "To stop services: docker-compose -f $DOCKER_COMPOSE_FILE down"
