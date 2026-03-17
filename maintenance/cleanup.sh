#!/bin/bash

# Distill Engine: Disk Maintenance Script
# This script purges redundant build artifacts and heavy caches to prevent storage failures.

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}===[ Distill Engine: Maintenance Mode ]===${NC}"

# Function to clear a directory and report
clear_dir() {
    local dir=$1
    local name=$2
    if [ -d "$dir" ]; then
        echo -n -e "Clearing $name... "
        rm -rf "$dir"
        echo -e "${GREEN}Done${NC}"
    else
        echo -e "Skipping $name (Not found)"
    fi
}

echo -e "\n${BLUE}1. Cleaning Build Artifacts...${NC}"
clear_dir "/Users/socket/distill/web/.next" "Distill Web (.next)"
# Add other projects if they exist and are likely to have build artifacts
if [ -d "/Users/socket/lstnr/web/.next" ]; then
    clear_dir "/Users/socket/lstnr/web/.next" "Lstnr Web (.next)"
fi

echo -e "\n${BLUE}2. Purging System Caches...${NC}"
clear_dir "$HOME/Library/Caches/SiriTTS" "Siri TTS Cache"
clear_dir "$HOME/Library/Caches/com.spotify.client" "Spotify Cache"
clear_dir "$HOME/Library/Caches/Arc" "Arc Browser Cache"

echo -e "\n${BLUE}3. Performance Metrics...${NC}"
df -h /System/Volumes/Data | grep -v Filesystem

echo -e "\n${GREEN}Maintenance Complete. Your disk is now breathing easier.${NC}"
