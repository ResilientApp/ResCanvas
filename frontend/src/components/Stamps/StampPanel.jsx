import React, { useState, useEffect } from "react";
import StampEditor from "./StampEditor";
import {
  Box,
  Typography,
  Button,
  Grid,
  Card,
  CardContent,
  IconButton,
  Slider,
  Stack,
  Divider,
  Chip,
  Dialog
} from "@mui/material";
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import RotateRightIcon from '@mui/icons-material/RotateRight';
import ZoomInIcon from '@mui/icons-material/ZoomIn';
import CloseIcon from '@mui/icons-material/Close';

const defaultStamps = [
  { id: "flower", emoji: "🌸", name: "Flower", category: "nature" },
  { id: "star", emoji: "⭐", name: "Star", category: "shapes" },
  { id: "clover", emoji: "🍀", name: "Clover", category: "nature" },
  { id: "fish", emoji: "🐠", name: "Fish", category: "animals" },
  { id: "heart", emoji: "❤️", name: "Heart", category: "shapes" },
  { id: "sun", emoji: "☀️", name: "Sun", category: "nature" },
  { id: "moon", emoji: "🌙", name: "Moon", category: "nature" },
  { id: "tree", emoji: "🌳", name: "Tree", category: "nature" },
  { id: "butterfly", emoji: "🦋", name: "Butterfly", category: "animals" },
  { id: "rainbow", emoji: "🌈", name: "Rainbow", category: "nature" },
  { id: "cat", emoji: "🐱", name: "Cat", category: "animals" },
  { id: "rocket", emoji: "🚀", name: "Rocket", category: "objects" },
];

export default function StampPanel({ onSelect, onStampChange, backendStamps = [], onClose }) {
  const [showEditor, setShowEditor] = useState(false);
  const [stamps, setStamps] = useState(defaultStamps);
  const [selectedStamp, setSelectedStamp] = useState(null);
  const [stampSettings, setStampSettings] = useState({
    size: 50,
    rotation: 0,
    opacity: 100
  });
  const [filterCategory, setFilterCategory] = useState("all");

  const categories = ["all", "nature", "shapes", "animals", "objects", "custom"];

  useEffect(() => {
    // Merge stamps from multiple sources:
    // 1. Default stamps (always present)
    // 2. localStorage stamps (user's local custom stamps)
    // 3. Backend stamps (custom stamps from all users in the room)

    const savedStamps = localStorage.getItem('rescanvas-stamps');
    let localCustomStamps = [];
    if (savedStamps) {
      try {
        localCustomStamps = JSON.parse(savedStamps);
      } catch (e) {
        console.warn('Failed to load saved stamps:', e);
      }
    }

    // Merge all stamps, avoiding duplicates
    // Use a Map to deduplicate by a combination of emoji/image content
    const stampMap = new Map();

    // Add default stamps first
    defaultStamps.forEach(stamp => {
      const key = stamp.id;
      stampMap.set(key, stamp);
    });

    // Add localStorage stamps
    localCustomStamps.forEach(stamp => {
      const key = stamp.id || (stamp.emoji ? `emoji-${stamp.emoji}` : `image-${stamp.image?.substring(0, 50)}`);
      if (!stampMap.has(key)) {
        stampMap.set(key, { ...stamp, id: stamp.id || key });
      }
    });

    // Add backend stamps (highest priority for custom stamps)
    backendStamps.forEach(stamp => {
      // For backend stamps, use image content or emoji as key to avoid duplicates
      const key = stamp.emoji ? `emoji-${stamp.emoji}` : `image-${stamp.image?.substring(0, 50)}`;
      if (!stampMap.has(key)) {
        // Ensure backend stamp has proper structure
        stampMap.set(key, {
          id: stamp.id || key,
          name: stamp.name || 'Custom Stamp',
          category: stamp.category || 'custom',
          emoji: stamp.emoji,
          image: stamp.image
        });
      }
    });

    const mergedStamps = Array.from(stampMap.values());
    setStamps(mergedStamps);

    console.log('StampPanel: Merged stamps', {
      defaultCount: defaultStamps.length,
      localCount: localCustomStamps.length,
      backendCount: backendStamps.length,
      totalUnique: mergedStamps.length
    });
  }, [backendStamps]);

  const saveStamps = (newStamps) => {
    const customStamps = newStamps.filter(s => !defaultStamps.find(d => d.id === s.id));
    localStorage.setItem('rescanvas-stamps', JSON.stringify(customStamps));
  };

  const handleStampSelect = (stamp) => {
    setSelectedStamp(stamp);
    if (onSelect) {
      onSelect(stamp, stampSettings);
    }
  };

  const handleSettingChange = (setting, value) => {
    const newSettings = { ...stampSettings, [setting]: value };
    setStampSettings(newSettings);

    if (selectedStamp && onStampChange) {
      onStampChange(selectedStamp, newSettings);
    }
  };

  const handleAddStamp = (newStamp) => {
    const updatedStamps = [...stamps, { ...newStamp, id: Date.now().toString() }];
    setStamps(updatedStamps);
    saveStamps(updatedStamps);
  };

  const handleDeleteStamp = (stampId) => {
    // Don't allow deleting default stamps
    if (defaultStamps.find(s => s.id === stampId)) return;

    const updatedStamps = stamps.filter(s => s.id !== stampId);
    setStamps(updatedStamps);
    saveStamps(updatedStamps);

    if (selectedStamp?.id === stampId) {
      setSelectedStamp(null);
    }
  };

  const filteredStamps = filterCategory === "all"
    ? stamps
    : stamps.filter(s => s.category === filterCategory);

  return (
    <div className="stamp-panel">
      <Box sx={{ mb: 2, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h6" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            📜 Stamp Library
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Click stamps to place on canvas
          </Typography>
        </Box>
        {onClose && (
          <IconButton
            onClick={onClose}
            size="small"
            sx={{
              mt: -0.5,
              '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.08)' }
            }}
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        )}
      </Box>

      {/* Category Filter */}
      <Box sx={{ mb: 2 }}>
        <Stack direction="row" spacing={1} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          {categories.map(category => (
            <Chip
              key={category}
              label={category.charAt(0).toUpperCase() + category.slice(1)}
              size="small"
              variant={filterCategory === category ? "filled" : "outlined"}
              onClick={() => setFilterCategory(category)}
              color={filterCategory === category ? "primary" : "default"}
            />
          ))}
        </Stack>
      </Box>

      {/* Stamp Grid */}
      <Grid container spacing={1} sx={{ mb: 2, maxHeight: 200, overflowY: 'auto' }}>
        {filteredStamps.map((stamp) => (
          <Grid item xs={3} key={stamp.id}>
            <Card
              sx={{
                cursor: 'pointer',
                border: selectedStamp?.id === stamp.id ? 2 : 1,
                borderColor: selectedStamp?.id === stamp.id ? 'primary.main' : 'grey.300',
                '&:hover': { bgcolor: 'grey.50' },
                position: 'relative'
              }}
              onClick={() => handleStampSelect(stamp)}
            >
              <CardContent sx={{ p: 1, textAlign: 'center', '&:last-child': { pb: 1 } }}>
                <Box sx={{ height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 0.5 }}>
                  {stamp.emoji ? (
                    <Typography variant="h4">
                      {stamp.emoji}
                    </Typography>
                  ) : stamp.image ? (
                    <img
                      src={stamp.image}
                      alt={stamp.name}
                      style={{
                        maxWidth: '40px',
                        maxHeight: '40px',
                        objectFit: 'contain'
                      }}
                    />
                  ) : null}
                </Box>
                <Typography variant="caption" sx={{ fontSize: '0.7rem' }}>
                  {stamp.name}
                </Typography>

                {!defaultStamps.find(s => s.id === stamp.id) && (
                  <IconButton
                    size="small"
                    sx={{ position: 'absolute', top: 0, right: 0, p: 0.5 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteStamp(stamp.id);
                    }}
                  >
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Button
        variant="outlined"
        startIcon={<AddIcon />}
        onClick={() => setShowEditor(true)}
        size="small"
        fullWidth
        sx={{ mb: 2 }}
      >
        Add Custom Stamp
      </Button>

      {selectedStamp && (
        <Box>
          <Divider sx={{ my: 2 }} />
          <Typography variant="subtitle2" sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
            <EditIcon fontSize="small" />
            Stamp Settings
          </Typography>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ZoomInIcon fontSize="small" />
              Size: {stampSettings.size}%
            </Typography>
            <Slider
              size="small"
              value={stampSettings.size}
              onChange={(_, value) => handleSettingChange('size', value)}
              min={10}
              max={200}
              valueLabelDisplay="auto"
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <RotateRightIcon fontSize="small" />
              Rotation: {stampSettings.rotation}°
            </Typography>
            <Slider
              size="small"
              value={stampSettings.rotation}
              onChange={(_, value) => handleSettingChange('rotation', value)}
              min={-180}
              max={180}
              step={15}
              valueLabelDisplay="auto"
            />
          </Box>

          <Box sx={{ mb: 2 }}>
            <Typography variant="caption">
              Opacity: {stampSettings.opacity}%
            </Typography>
            <Slider
              size="small"
              value={stampSettings.opacity}
              onChange={(_, value) => handleSettingChange('opacity', value)}
              min={10}
              max={100}
              valueLabelDisplay="auto"
            />
          </Box>

          <Box sx={{ p: 1, bgcolor: 'grey.50', borderRadius: 1, textAlign: 'center' }}>
            <Typography variant="caption" color="text.secondary">Preview:</Typography>
            <div style={{
              display: 'inline-block',
              margin: '8px'
            }}>
              {selectedStamp.emoji ? (
                <div style={{
                  fontSize: `${stampSettings.size * 0.5}px`,
                  transform: `rotate(${stampSettings.rotation}deg)`,
                  opacity: stampSettings.opacity / 100,
                  display: 'inline-block'
                }}>
                  {selectedStamp.emoji}
                </div>
              ) : selectedStamp.image ? (
                <img
                  src={selectedStamp.image}
                  alt={selectedStamp.name}
                  style={{
                    width: `${stampSettings.size}px`,
                    height: `${stampSettings.size}px`,
                    transform: `rotate(${stampSettings.rotation}deg)`,
                    opacity: stampSettings.opacity / 100,
                    objectFit: 'contain'
                  }}
                />
              ) : null}
            </div>
          </Box>
        </Box>
      )}

      <Dialog open={showEditor} onClose={() => setShowEditor(false)} maxWidth="md" fullWidth>
        <StampEditor
          onSave={handleAddStamp}
          onClose={() => setShowEditor(false)}
        />
      </Dialog>
    </div>
  );
}
