import React, { useEffect, useState } from 'react';
import { Box, Grid, CircularProgress, Button } from '@mui/material';
import InsightCard from '../components/Analytics/InsightCard';
import CollaborationGraph from '../components/Analytics/CollaborationGraph';
import HeatmapVisualization from '../components/Analytics/HeatmapVisualization';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch('/api/analytics/overview');
        const j = await r.json();
        setOverview(j);
      } catch (e) {
        console.error(e);
      }
      setLoading(false);
    }
    load();
  }, []);

  const genInsights = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/analytics/insights', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      const j = await r.json();
      setInsights(j);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  return (
    <Box sx={{ p: 2 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <h2>Analytics Dashboard</h2>
        <Button onClick={genInsights} variant="contained">Generate Insights</Button>
      </Box>
      {loading && <CircularProgress />}
      {!loading && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <InsightCard title="Overview" text={overview ? JSON.stringify(overview, null, 2) : 'No data'} />
            {insights && insights.summary && (
              <InsightCard title="AI Summary" text={insights.summary || ''} />
            )}
            {insights && insights.recommendations && insights.recommendations.map((r, i) => (
              <InsightCard key={i} title={`Recommendation ${i+1}`} text={r} />
            ))}
          </Grid>
          <Grid item xs={12} md={6}>
            <HeatmapVisualization points={(overview && overview.heatmap_points) || []} />
            <CollaborationGraph pairs={(overview && overview.collaboration_pairs) || []} />
          </Grid>
        </Grid>
      )}
    </Box>
  );
}
