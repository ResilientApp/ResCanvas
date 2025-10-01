// Simulate the bug vs fix
console.log("=== DEMONSTRATING THE BUG ===\n");

console.log("OLD CODE (Bug - accumulates IDs):");
console.log("const newCutOriginalIds = new Set(cutOriginalIds);\n");

let cutOriginalIds_bug = new Set();

// First cut
let newCutOriginalIds_bug = new Set(cutOriginalIds_bug);
newCutOriginalIds_bug.add("stroke_1");
cutOriginalIds_bug = newCutOriginalIds_bug;
console.log("After Cut #1:", Array.from(cutOriginalIds_bug));

// Second cut
newCutOriginalIds_bug = new Set(cutOriginalIds_bug); // BUG: Preserves old IDs
newCutOriginalIds_bug.add("stroke_2");
cutOriginalIds_bug = newCutOriginalIds_bug;
console.log("After Cut #2:", Array.from(cutOriginalIds_bug), "← BUG: Has stroke_1 too!");

// Third cut
newCutOriginalIds_bug = new Set(cutOriginalIds_bug);
newCutOriginalIds_bug.add("stroke_3");
cutOriginalIds_bug = newCutOriginalIds_bug;
console.log("After Cut #3:", Array.from(cutOriginalIds_bug), "← BUG: Has all previous!");

console.log("\n" + "=".repeat(60) + "\n");

console.log("NEW CODE (Fix - starts fresh):");
console.log("const newCutOriginalIds = new Set(); // Empty!\n");

let cutOriginalIds_fix = new Set();

// First cut
let newCutOriginalIds_fix = new Set(); // FIXED: Start fresh
newCutOriginalIds_fix.add("stroke_1");
cutOriginalIds_fix = newCutOriginalIds_fix;
console.log("After Cut #1:", Array.from(cutOriginalIds_fix));

// Second cut
newCutOriginalIds_fix = new Set(); // FIXED: Start fresh
newCutOriginalIds_fix.add("stroke_2");
cutOriginalIds_fix = newCutOriginalIds_fix;
console.log("After Cut #2:", Array.from(cutOriginalIds_fix), "← FIXED: Only stroke_2!");

// Third cut
newCutOriginalIds_fix = new Set(); // FIXED: Start fresh
newCutOriginalIds_fix.add("stroke_3");
cutOriginalIds_fix = newCutOriginalIds_fix;
console.log("After Cut #3:", Array.from(cutOriginalIds_fix), "← FIXED: Only stroke_3!");

console.log("\n" + "=".repeat(60));
console.log("SUMMARY: Each cut should only track IDs from THAT cut operation");
console.log("=".repeat(60));
