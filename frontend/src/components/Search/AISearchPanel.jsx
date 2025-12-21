import React, { useState } from 'react';
import { Box, TextField, Button, Stack, Paper, Typography, List, ListItem, Divider, CircularProgress, Alert } from '@mui/material';
import apiClient from '../../api/apiClient';
import RouterLinkWrapper from '../RouterLinkWrapper';
import VisualSearchUpload from './VisualSearchUpload';

export default function AISearchPanel({ auth }) {
  const [imageB64, setImageB64] = useState(null);
  const [query, setQuery] = useState('');
  const [uploadedFilename, setUploadedFilename] = useState(null);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);

  const doSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      if (!imageB64 && (!query || !query.trim())) {
        setError('Please provide a description or upload an image to search.');
        setResults([]);
        return;
      }
      const payload = {};
      if (query && query.trim()) payload.q = query.trim();
      if (imageB64) payload.image_b64 = imageB64;
      const res = await apiClient.post('/api/v1/search/ai', payload);
      if (!res) {
        setResults([]);
        setError('No response from server');
      } else if (res.status && res.status !== 'ok') {
        setResults([]);
        setError(res.message || 'Search failed');
      } else {
        setResults((res && res.results) || []);
      }
    } catch (e) {
      console.error('Search failed', e);
      const msg = (e && e.message) || 'Network or server error';
      setError(msg);
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Paper sx={{ p: 2, mb: 2 }}>
      <Stack spacing={1}>
        <Typography variant="subtitle1">AI Search</Typography>
        <Stack spacing={1}>
          <TextField
            size="small"
            placeholder="Enter canvas description (long text allowed)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            fullWidth
            multiline
            minRows={2}
          />
          <Stack direction="row" spacing={1} alignItems="center">
            <VisualSearchUpload onImageBase64={(b64) => setImageB64(b64)} onFileName={(fn) => setUploadedFilename(fn)} />
            <Button variant="contained" size="small" onClick={doSearch} disabled={loading}>Search</Button>
            <Button size="small" onClick={() => { setQuery(''); setImageB64(null); setUploadedFilename(null); setResults([]); setError(null); }}>Reset</Button>
          </Stack>
        </Stack>
        {uploadedFilename && (
          <Typography variant="caption" color="text.secondary">Uploaded: {uploadedFilename}</Typography>
        )}
        {loading && <CircularProgress size={20} />}
        {error && <Alert severity="error">{error}</Alert>}

        <Divider />

        <Box>
          <Typography variant="subtitle2">Results</Typography>
          <List>
            {results.length === 0 && <ListItem><Typography variant="body2" color="text.secondary">No results</Typography></ListItem>}
            {results.map(r => (
              <ListItem key={r.id} sx={{ flexDirection: 'column', alignItems: 'flex-start' }}>
                <Stack direction="row" spacing={1} sx={{ width: '100%', justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body1" component={RouterLinkWrapper} to={`/rooms/${r.id}`} style={{ textDecoration: 'none' }}>{r.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{r.ownerName || ''}</Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption">score: {typeof r.score === 'number' ? r.score.toFixed(2) : '-'}</Typography>
                  </Box>
                </Stack>
                {r.snippet && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{r.snippet}</Typography>}
              </ListItem>
            ))}
          </List>
        </Box>
      </Stack>
    </Paper>
  );
}
