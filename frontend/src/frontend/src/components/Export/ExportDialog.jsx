import React, { useState } from "react";

export default function ExportDialog({ open, onClose, onExport }) {
  const [format, setFormat] = useState("png");

  if (!open) return null;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999
    }}>
      <div style={{ background: "#fff", padding: 20, borderRadius: 8, width: 360 }}>
        <h3>Export Project</h3>

        <label>
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value)} style={{ marginLeft: 8 }}>
            <option value="png">PNG</option>
            <option value="svg">SVG</option>
            <option value="pdf">PDF</option>
            <option value="json">Project JSON</option>
          </select>
        </label>

        <div style={{ marginTop: 16, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={onClose}>Cancel</button>
          <button onClick={() => { onExport(format); onClose(); }}>Export</button>
        </div>
      </div>
    </div>
  );
}
