// Brace validation script for Canvas.js
const fs = require('fs');

function validateBraces(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let braceCount = 0;
    let parenCount = 0;
    let bracketCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Count braces
        for (const char of line) {
            if (char === '{') braceCount++;
            else if (char === '}') braceCount--;
            else if (char === '(') parenCount++;
            else if (char === ')') parenCount--;
            else if (char === '[') bracketCount++;
            else if (char === ']') bracketCount--;
        }
        
        // Report if we have negative counts (more closing than opening)
        if (braceCount < 0 || parenCount < 0 || bracketCount < 0) {
            console.log(`Line ${i + 1}: Mismatched braces/parens/brackets`);
            console.log(`  Braces: ${braceCount}, Parens: ${parenCount}, Brackets: ${bracketCount}`);
            console.log(`  Line content: ${line}`);
            break;
        }
    }
    
    console.log(`Final counts:`);
    console.log(`  Braces: ${braceCount} (should be 0)`);
    console.log(`  Parentheses: ${parenCount} (should be 0)`);
    console.log(`  Brackets: ${bracketCount} (should be 0)`);
    
    if (braceCount !== 0) {
        console.log(`ERROR: ${braceCount} unclosed braces!`);
        return false;
    }
    
    return true;
}

validateBraces('./frontend/src/components/Canvas.js');
