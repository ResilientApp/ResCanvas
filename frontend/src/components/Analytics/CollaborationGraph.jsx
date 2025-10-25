import React from 'react';

// Minimal placeholder component. A real implementation would use D3 or vis-network.
export default function CollaborationGraph({ pairs }) {
  return (
    <div style={{ padding: 12 }}>
      <h4>Collaboration Graph</h4>
      {pairs && pairs.length ? (
        <ul>
          {pairs.map((p, idx) => (
            <li key={idx}>{p[0]} ↔ {p[1]} ({p[2] || 'n'})</li>
          ))}
        </ul>
      ) : (
        <div>No collaboration data</div>
      )}
    </div>
  );
}
