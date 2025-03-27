set -e

export DOCKER_BUILDKIT=0

docker-compose -f docker-compose.yml build;
docker-compose -f docker-compose.yml push;