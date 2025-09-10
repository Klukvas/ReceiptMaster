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

# Copy logo
if [ -f "src/assets/logo.png" ]; then
    cp src/assets/logo.png dist/modules/assets/ 2>/dev/null || true
    echo "Logo copied successfully"
else
    echo "Logo file not found"
fi

echo "Assets copy completed"
