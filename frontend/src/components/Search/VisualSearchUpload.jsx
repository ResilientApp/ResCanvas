import React from 'react';
import { Button, Typography } from '@mui/material';

/**
 * VisualSearchUpload
 * Props:
 *  - onImageBase64(base64String)
 *  - onFileName(filename)
 *  - accept (string) optional file accept string
 */
export default function VisualSearchUpload({ onImageBase64, onFileName, accept = 'image/*' }) {
  const fileInputRef = React.useRef(null);
  const [filename, setFilename] = React.useState(null);

  const handleFile = (file) => {
    if (!file) return;
    setFilename(file.name || null);
    if (typeof onFileName === 'function') onFileName(file.name || null);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result || '';
      const b64 = dataUrl.split(',')[1] || '';
      if (typeof onImageBase64 === 'function') onImageBase64(b64);
    };
    reader.readAsDataURL(file);
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        style={{ display: 'none' }}
        onChange={(e) => handleFile(e.target.files && e.target.files[0])}
      />
      <Button size="small" variant="outlined" onClick={() => fileInputRef.current && fileInputRef.current.click()}>
        Upload Image
      </Button>
      {filename && (
        <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{filename}</Typography>
      )}
    </>
  );
}
