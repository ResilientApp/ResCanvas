import React, { useEffect, useState } from 'react';
import { Box, Grid, CircularProgress, Button } from '@mui/material';
import InsightCard from '../components/Analytics/InsightCard';
import CollaborationGraph from '../components/Analytics/CollaborationGraph';
import HeatmapVisualization from '../components/Analytics/HeatmapVisualization';
import { API_BASE } from '../config/apiConfig';

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState(null);
  const [insights, setInsights] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetch(`${API_BASE}/api/analytics/overview`);
        if (!r.ok) {
          console.error('Failed to fetch analytics overview:', r.status, r.statusText);
          setLoading(false);
          return;
        }
        const contentType = r.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
          console.error('Response is not JSON:', contentType);
          setLoading(false);
          return;
        }
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
      const r = await fetch(`${API_BASE}/api/analytics/insights`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
      if (!r.ok) {
        console.error('Failed to generate insights:', r.status, r.statusText);
        setLoading(false);
        return;
      }
      const contentType = r.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        console.error('Response is not JSON:', contentType);
        setLoading(false);
        return;
      }
      const j = await r.json();
      setInsights(j);
    } catch (e) {
      console.error(e);
    }
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
            {overview && (
              <>
                <InsightCard
                  title="Overview Statistics"
                  text={`Total Strokes: ${overview.total_strokes || 0}\nActive Users: ${overview.active_users || 0}\nTotal Rooms: ${overview.total_rooms || 0}`}
                />
                {overview.top_colors && overview.top_colors.length > 0 && (
                  <InsightCard
                    title="Top Colors"
                    text={overview.top_colors.join(', ')}
                  />
                )}
              </>
            )}
            {!overview && (
              <InsightCard title="Overview" text="No analytics data available. Start drawing in rooms to generate analytics!" />
            )}
            {insights && insights.summary && (
              <InsightCard title="AI Insights Summary" text={insights.summary || ''} />
            )}
            {insights && insights.recommendations && insights.recommendations.map((r, i) => (
              <InsightCard key={i} title={`Recommendation ${i + 1}`} text={r} />
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
