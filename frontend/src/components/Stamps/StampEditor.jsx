import React, { useState, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  FormControl,
  InputLabel,
  MenuItem,
  Box,
  Typography,
  Paper,
  Grid,
  IconButton,
  Divider,
  Alert
} from "@mui/material";
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import EmojiEmotionsIcon from '@mui/icons-material/EmojiEmotions';
import ImageIcon from '@mui/icons-material/Image';

const popularEmojis = [
  "🎨", "✨", "🌟", "💫", "🔥", "💧", "🌈", "☀️", "🌙", "⭐",
  "🌸", "🌺", "🌻", "🌷", "🌹", "🍀", "🌿", "🌱", "🌳", "🌲",
  "🦋", "🐝", "🐠", "🐡", "🐙", "🦄", "🐱", "🐶", "🐰", "🐸",
  "❤️", "💙", "💚", "💛", "💜", "🧡", "🖤", "🤍", "💗", "💖",
  "🚀", "⚡", "💎", "🎵", "🎶", "🎭", "🎪", "🎨", "🎯", "🎲"
];

const categories = [
  { value: "nature", label: "Nature" },
  { value: "shapes", label: "Shapes" },
  { value: "animals", label: "Animals" },
  { value: "objects", label: "Objects" },
  { value: "symbols", label: "Symbols" }
];

export default function StampEditor({ onSave, onClose }) {
  const [stampData, setStampData] = useState({
    name: "",
    emoji: "🎨",
    category: "objects",
    image: null
  });
  const [mode, setMode] = useState("emoji");
  const fileInputRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [error, setError] = useState("");

  const handleEmojiSelect = (emoji) => {
    setStampData({ ...stampData, emoji });
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      if (file.size > 1024 * 1024) {
        setError("Image must be less than 1MB");
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target.result);
        setStampData({ ...stampData, image: e.target.result });
        setError("");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    if (!stampData.name.trim()) {
      setError("Please enter a stamp name");
      return;
    }

    if (mode === "emoji" && !stampData.emoji) {
      setError("Please select an emoji");
      return;
    }

    if (mode === "image" && !stampData.image) {
      setError("Please upload an image");
      return;
    }

    const newStamp = {
      name: stampData.name.trim(),
      category: stampData.category,
      [mode]: mode === "emoji" ? stampData.emoji : stampData.image
    };

    onSave(newStamp);
    onClose();
  };

  return (
    <>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <EmojiEmotionsIcon />
        Create Custom Stamp
      </DialogTitle>

      <DialogContent sx={{ minWidth: 500 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Box sx={{ mb: 3 }}>
          <TextField
            fullWidth
            label="Stamp Name"
            value={stampData.name}
            onChange={(e) => setStampData({ ...stampData, name: e.target.value })}
            placeholder="Enter a name for your stamp"
            sx={{ mb: 2 }}
          />

          <FormControl fullWidth sx={{ mb: 2 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={stampData.category}
              onChange={(e) => setStampData({ ...stampData, category: e.target.value })}
              label="Category"
            >
              {categories.map(cat => (
                <MenuItem key={cat.value} value={cat.value}>
                  {cat.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <Box sx={{ mb: 2 }}>
            <Button
              variant={mode === "emoji" ? "contained" : "outlined"}
              onClick={() => setMode("emoji")}
              startIcon={<EmojiEmotionsIcon />}
              sx={{ mr: 1 }}
            >
              Emoji
            </Button>
            <Button
              variant={mode === "image" ? "contained" : "outlined"}
              onClick={() => setMode("image")}
              startIcon={<ImageIcon />}
            >
              Image
            </Button>
          </Box>
        </Box>

        {mode === "emoji" && (
          <Box>
            <Typography variant="subtitle2" sx={{ mb: 1 }}>
              Choose an Emoji:
            </Typography>
            <Paper sx={{ p: 2, maxHeight: 200, overflowY: 'auto', mb: 2 }}>
              <Grid container spacing={1}>
                {popularEmojis.map((emoji, index) => (
                  <Grid item key={index}>
                    <IconButton
                      onClick={() => handleEmojiSelect(emoji)}
                      sx={{
                        fontSize: '1.5rem',
                        border: stampData.emoji === emoji ? 2 : 1,
                        borderColor: stampData.emoji === emoji ? 'primary.main' : 'grey.300',
                        borderStyle: 'solid'
                      }}
                    >
                      {emoji}
                    </IconButton>
                  </Grid>
                ))}
              </Grid>
            </Paper>

            <TextField
              fullWidth
              label="Or enter custom emoji/symbol"
              value={stampData.emoji}
              onChange={(e) => setStampData({ ...stampData, emoji: e.target.value })}
              placeholder="🎨"
              sx={{ mb: 2 }}
            />
          </Box>
        )}

        {mode === "image" && (
          <Box>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              style={{ display: 'none' }}
            />

            <Button
              variant="outlined"
              onClick={() => fileInputRef.current?.click()}
              startIcon={<CloudUploadIcon />}
              fullWidth
              sx={{ mb: 2 }}
            >
              Upload Image
            </Button>

            {previewImage && (
              <Box sx={{ textAlign: 'center', mb: 2 }}>
                <Typography variant="subtitle2" sx={{ mb: 1 }}>
                  Preview:
                </Typography>
                <img
                  src={previewImage}
                  alt="Preview"
                  style={{
                    maxWidth: 100,
                    maxHeight: 100,
                    border: '1px solid #ccc',
                    borderRadius: 4
                  }}
                />
              </Box>
            )}
          </Box>
        )}

        <Divider sx={{ my: 2 }} />

        <Box sx={{ textAlign: 'center', p: 2, bgcolor: 'grey.50', borderRadius: 1 }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Preview:
          </Typography>
          <div style={{ fontSize: '3rem' }}>
            {mode === "emoji" ? stampData.emoji : (
              previewImage ? (
                <img
                  src={previewImage}
                  alt="Preview"
                  style={{ width: 60, height: 60, objectFit: 'contain' }}
                />
              ) : "📷"
            )}
          </div>
          <Typography variant="caption" color="text.secondary">
            {stampData.name || "Untitled Stamp"}
          </Typography>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave} variant="contained">
          Save Stamp
        </Button>
      </DialogActions>
    </>
  );
}








