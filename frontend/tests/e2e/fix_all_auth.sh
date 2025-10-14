#!/bin/bash

# The pattern that works (from test that passed):
# await page.goto('/');
# await page.evaluate((auth) => {
#   const authStr = JSON.stringify(auth);
#   localStorage.setItem('auth', authStr);
#   window.dispatchEvent(new StorageEvent('storage', {...}));
# }, auth);
# await page.goto('/target');

# Apply this via Python since bash regex is limited
python3 << 'PYTHON_EOF'
import re

files = ['profile.spec.js', 'roomSettings.spec.js']

for fname in files:
    with open(fname, 'r') as f:
        content = f.read()
    
    # Remove all waitForTimeout calls after profile/settings navigation
    content = re.sub(
        r"await page\.goto\('http://localhost:3000/(profile|rooms/\$\{roomId\}/settings)'\);\s*await page\.waitForTimeout\(\d+\);",
        r"await page.goto('http://localhost:3000/\1');",
        content
    )
    
    with open(fname, 'w') as f:
        f.write(content)
    print(f"Fixed {fname}")
PYTHON_EOF
