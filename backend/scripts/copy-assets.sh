#!/bin/bash

# Create assets directories
mkdir -p dist/modules/assets/fonts
mkdir -p dist/modules/receipts/templates/html
mkdir -p dist/modules/receipts/templates/translations

# Copy fonts
if [ -d "src/assets/fonts" ]; then
    cp src/assets/fonts/*.ttf dist/modules/assets/fonts/ 2>/dev/null || true
    echo "Fonts copied successfully"
else
    echo "Fonts directory not found"
fi

# Copy HTML templates
if [ -d "src/modules/receipts/templates/html" ]; then
    cp src/modules/receipts/templates/html/*.html dist/modules/receipts/templates/html/ 2>/dev/null || true
    echo "HTML templates copied successfully"
else
    echo "HTML templates directory not found"
fi

# Copy translation files
if [ -d "src/modules/receipts/templates/translations" ]; then
    cp src/modules/receipts/templates/translations/*.json dist/modules/receipts/templates/translations/ 2>/dev/null || true
    echo "Translations copied successfully"
else
    echo "Translations directory not found"
fi

# Note: Logo is served directly from src/assets, not copied to dist
# This ensures the logo is always fresh and can be updated without rebuilding

echo "Assets copy completed"
