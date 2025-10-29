// Detailed brace validation script for Canvas.js
const fs = require('fs');

function findMismatchedBraces(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    
    let braceStack = [];
    let braceCount = 0;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        
        // Skip comments and strings (basic approach)
        let cleanLine = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
        
        for (let j = 0; j < cleanLine.length; j++) {
            const char = cleanLine[j];
            
            if (char === '{') {
                braceCount++;
                braceStack.push({ line: i + 1, col: j + 1, type: 'open' });
            } else if (char === '}') {
                braceCount--;
                braceStack.push({ line: i + 1, col: j + 1, type: 'close' });
                
                if (braceCount < 0) {
                    console.log(`ERROR: Extra closing brace at line ${i + 1}, column ${j + 1}`);
                    console.log(`Line: ${line.trim()}`);
                    return false;
                }
            }
        }
        
        // Show progress every 500 lines
        if ((i + 1) % 500 === 0) {
            console.log(`Line ${i + 1}: Brace count = ${braceCount}`);
        }
    }
    
    console.log(`\nFinal brace count: ${braceCount}`);
    
    if (braceCount > 0) {
        console.log(`ERROR: ${braceCount} unclosed opening braces`);
        
        // Find the last few opening braces
        let openBraces = braceStack.filter(b => b.type === 'open');
        let closeBraces = braceStack.filter(b => b.type === 'close');
        
        console.log(`\nTotal opening braces: ${openBraces.length}`);
        console.log(`Total closing braces: ${closeBraces.length}`);
        
        if (openBraces.length > closeBraces.length) {
            console.log(`\nLast few opening braces that might be unclosed:`);
            openBraces.slice(-5).forEach(brace => {
                console.log(`  Line ${brace.line}, Column ${brace.col}: ${lines[brace.line - 1].trim()}`);
            });
        }
        
        return false;
    }
    
    return true;
}

findMismatchedBraces('./frontend/src/components/Canvas.js');
