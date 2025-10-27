import React, { useState, useRef, useEffect } from "react";
import { 
  Box, 
  Typography, 
  Slider, 
  Button, 
  Chip, 
  Divider,
  Stack,
  Paper,
  IconButton
} from "@mui/material";
import PreviewIcon from '@mui/icons-material/Preview';
import UndoIcon from '@mui/icons-material/Undo';
import ApplyIcon from '@mui/icons-material/Check';

const filters = [
  { 
    id: "blur", 
    name: "Blur", 
    icon: "💨", 
    description: "Soften sharp edges",
    params: { intensity: { min: 0, max: 20, default: 5 } }
  },
  { 
    id: "hueShift", 
    name: "Hue Shift", 
    icon: "🌈", 
    description: "Change color tones",
    params: { 
      hue: { min: -180, max: 180, default: 30 },
      saturation: { min: -100, max: 100, default: 0 }
    }
  },
  { 
    id: "chalk", 
    name: "Chalk", 
    icon: "📏", 
    description: "Chalky texture effect",
    params: { 
      roughness: { min: 0, max: 100, default: 50 },
      opacity: { min: 10, max: 100, default: 80 }
    }
  },
  { 
    id: "fade", 
    name: "Fade", 
    icon: "🌫️", 
    description: "Reduce opacity gradually",
    params: { 
      amount: { min: 10, max: 90, default: 30 },
      gradient: { min: 0, max: 100, default: 50 }
    }
  },
  { 
    id: "vintage", 
    name: "Vintage", 
    icon: "📷", 
    description: "Old photo effect",
    params: { 
      sepia: { min: 0, max: 100, default: 60 },
      vignette: { min: 0, max: 100, default: 40 }
    }
  },
  { 
    id: "neon", 
    name: "Neon Glow", 
    icon: "💫", 
    description: "Electric glow effect",
    params: { 
      intensity: { min: 0, max: 50, default: 15 },
      color: { min: 0, max: 360, default: 180 }
    }
  }
];

export default function MixerPanel({ onApply, onPreview, onUndo, canUndo = false }) {
  const [selectedFilter, setSelectedFilter] = useState(null);
  const [filterParams, setFilterParams] = useState({});
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const previewCanvasRef = useRef(null);

  useEffect(() => {
    if (selectedFilter) {
      const filter = filters.find(f => f.id === selectedFilter);
      if (filter) {
        const defaultParams = {};
        Object.entries(filter.params).forEach(([key, config]) => {
          defaultParams[key] = config.default;
        });
        setFilterParams(defaultParams);
      }
    }
  }, [selectedFilter]);

  const handleFilterSelect = (filterId) => {
    setSelectedFilter(filterId);
    setIsPreviewMode(false);
  };

  const handleParamChange = (param, value) => {
    const newParams = { ...filterParams, [param]: value };
    setFilterParams(newParams);
    
    if (isPreviewMode && onPreview) {
      onPreview(selectedFilter, newParams);
    }
  };

  const handlePreview = () => {
    if (selectedFilter && onPreview) {
      setIsPreviewMode(true);
      onPreview(selectedFilter, filterParams);
    }
  };

  const handleApply = () => {
    if (selectedFilter && onApply) {
      onApply(selectedFilter, filterParams);
      setIsPreviewMode(false);
    }
  };

  const handleUndo = () => {
    if (onUndo) {
      onUndo();
      setIsPreviewMode(false);
    }
  };

  const selectedFilterData = filters.find(f => f.id === selectedFilter);

  return (
    <div className="mixer-panel">
      <Box sx={{ mb: 2 }}>
        <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          🧪 Mixer Tool
        </Typography>
        <Typography variant="caption" color="text.secondary">
          Apply non-destructive filters
        </Typography>
      </Box>

      <div className="filter-grid">
        {filters.map((filter) => (
          <button
            key={filter.id}
            className={`filter-card ${selectedFilter === filter.id ? "active" : ""}`}
            onClick={() => handleFilterSelect(filter.id)}
            title={filter.description}
          >
            <div className="filter-icon">{filter.icon}</div>
            <div className="filter-name">{filter.name}</div>
          </button>
        ))}
      </div>

      {selectedFilterData && (
        <Box sx={{ mt: 2 }}>
          <Paper sx={{ p: 2, bgcolor: 'grey.50' }}>
            <Typography variant="subtitle2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
              {selectedFilterData.icon} {selectedFilterData.name}
            </Typography>
            <Chip 
              label={selectedFilterData.description} 
              size="small" 
              color="primary" 
              variant="outlined"
              sx={{ mb: 2 }}
            />

            <Box sx={{ mt: 2 }}>
              {Object.entries(selectedFilterData.params).map(([param, config]) => (
                <Box key={param} sx={{ mb: 2 }}>
                  <Typography variant="caption" sx={{ textTransform: 'capitalize' }}>
                    {param.replace(/([A-Z])/g, ' $1')}: {filterParams[param] || config.default}
                  </Typography>
                  <Slider
                    size="small"
                    value={filterParams[param] || config.default}
                    onChange={(_, value) => handleParamChange(param, value)}
                    min={config.min}
                    max={config.max}
                    step={param === 'hue' ? 5 : 1}
                    valueLabelDisplay="auto"
                  />
                </Box>
              ))}
            </Box>

            <Divider sx={{ my: 2 }} />

            <Stack direction="row" spacing={1} sx={{ mt: 2 }}>
              <Button
                variant="outlined"
                size="small"
                startIcon={<PreviewIcon />}
                onClick={handlePreview}
                disabled={!selectedFilter}
              >
                Preview
              </Button>
              
              <Button
                variant="contained"
                size="small"
                startIcon={<ApplyIcon />}
                onClick={handleApply}
                disabled={!selectedFilter}
                color="primary"
              >
                Apply
              </Button>

              {canUndo && (
                <IconButton
                  size="small"
                  onClick={handleUndo}
                  title="Undo filter"
                >
                  <UndoIcon />
                </IconButton>
              )}
            </Stack>

            {isPreviewMode && (
              <Typography variant="caption" color="info.main" sx={{ mt: 1, display: 'block' }}>
                Preview mode active - Click Apply to commit changes
              </Typography>
            )}
          </Paper>
        </Box>
      )}
    </div>
  );
}

