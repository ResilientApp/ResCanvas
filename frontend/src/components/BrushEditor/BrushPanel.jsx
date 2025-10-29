import React, { useState } from "react";
import WackyBrushPreview from "./WackyBrushPreview";
import { Slider, Typography, Box, Divider, Chip } from "@mui/material";
import "../../styles/brushes.css";

const brushes = [
  { id: "normal", name: "Normal", icon: "🖌️", description: "Classic smooth brush" },
  { id: "wacky", name: "Wacky", icon: "🎨", description: "Colorful scattered particles" },
  { id: "drip", name: "Drip", icon: "💧", description: "Paint that drips and flows" },
  { id: "scatter", name: "Scatter", icon: "✨", description: "Random scattered dots" },
  { id: "neon", name: "Neon", icon: "💫", description: "Glowing neon effect" },
  { id: "chalk", name: "Chalk", icon: "📏", description: "Textured chalk strokes" },
  { id: "spray", name: "Spray", icon: "🖨️", description: "Spray paint effect" },
];

export default function BrushPanel({ onSelect, onParamsChange, selectedBrush = "normal" }) {
  const [selected, setSelected] = useState(selectedBrush);
  const [brushParams, setBrushParams] = useState({
    intensity: 50,
    variation: 50,
    flow: 50
  });

  const handleSelect = (id) => {
    setSelected(id);
    if (onSelect) onSelect(id);
  };

  const handleParamChange = (param, value) => {
    const newParams = { ...brushParams, [param]: value };
    setBrushParams(newParams);
    if (onParamsChange) onParamsChange(newParams);
  };

  const selectedBrushData = brushes.find(b => b.id === selected);

  return (
    <div className="brush-panel">
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          🎨 Brush Panel
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Choose your creative brush
        </Typography>
      </Box>

      <div className="brush-grid">
        {brushes.map((brush) => (
          <button
            key={brush.id}
            className={`brush-card ${selected === brush.id ? "active" : ""}`}
            onClick={() => handleSelect(brush.id)}
            title={brush.description}
          >
            <div className="brush-icon">{brush.icon}</div>
            <div className="brush-name">{brush.name}</div>
          </button>
        ))}
      </div>

      {selectedBrushData && (
        <Box sx={{ mt: 2 }}>
          <Chip 
            label={selectedBrushData.description} 
            size="small" 
            color="primary" 
            variant="outlined"
            sx={{ mb: 2 }}
          />
        </Box>
      )}

      <div className="brush-preview">
        <Typography variant="subtitle2" sx={{ mb: 1 }}>Preview:</Typography>
        <WackyBrushPreview brushId={selected} params={brushParams} />
      </div>

      <Divider sx={{ my: 2 }} />

      <Box sx={{ mt: 2 }}>
        <Typography variant="subtitle2" sx={{ mb: 2 }}>Brush Settings:</Typography>
        
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption">Intensity</Typography>
          <Slider
            size="small"
            value={brushParams.intensity}
            onChange={(_, value) => handleParamChange('intensity', value)}
            min={10}
            max={100}
            valueLabelDisplay="auto"
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption">Variation</Typography>
          <Slider
            size="small"
            value={brushParams.variation}
            onChange={(_, value) => handleParamChange('variation', value)}
            min={0}
            max={100}
            valueLabelDisplay="auto"
          />
        </Box>

        <Box sx={{ mb: 2 }}>
          <Typography variant="caption">Flow</Typography>
          <Slider
            size="small"
            value={brushParams.flow}
            onChange={(_, value) => handleParamChange('flow', value)}
            min={10}
            max={100}
            valueLabelDisplay="auto"
          />
        </Box>
      </Box>
    </div>
  );
}
