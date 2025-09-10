#!/bin/bash

# Create assets directories
mkdir -p dist/modules/assets/fonts

# Copy fonts
if [ -d "src/assets/fonts" ]; then
    cp src/assets/fonts/*.ttf dist/modules/assets/fonts/ 2>/dev/null || true
    echo "Fonts copied successfully"
else
    echo "Fonts directory not found"
fi

# Note: Logo is served directly from src/assets, not copied to dist
# This ensures the logo is always fresh and can be updated without rebuilding

echo "Assets copy completed"
