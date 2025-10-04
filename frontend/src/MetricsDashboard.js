import React, { useEffect, useState } from "react";
import { API_BASE } from './config/apiConfig';
import {
  Box,
  Button,
  CircularProgress,
  Paper,
  Typography,
  Grid,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import theme from "./theme";

export default function MetricsDashboard() {
  const [loading, setLoading] = useState(false);
  const [metrics, setMetrics] = useState(null);

  async function fetchLatest() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/metrics`);
      const ctype = resp.headers.get("content-type") || "";
      let payload = null;
      if (ctype.includes("application/json")) {
        payload = await resp.json();
      } else {
        const txt = await resp.text();
        try {
          payload = JSON.parse(txt);
        } catch (err) {
          payload = { errorText: txt || `[non-json response, status ${resp.status}]` };
        }
      }
      if (resp.ok && payload && payload.metrics) {
        setMetrics(payload.metrics);
      } else {
        console.warn("fetchLatest: non-ok response", resp.status, payload);
        setMetrics(null);
      }
    } catch (e) {
      console.error(e);
      setMetrics(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLatest();
  }, []);

  async function runBenchmarks() {
    setLoading(true);
    try {
      const resp = await fetch(`${API_BASE}/runBenchmarks`, { method: "POST" });
      const ctype = resp.headers.get("content-type") || "";
      let body = null;
      if (ctype.includes("application/json")) {
        body = await resp.json();
      } else {
        const txt = await resp.text();
        try {
          body = JSON.parse(txt);
        } catch (err) {
          body = { errorText: txt || `[non-json response, status ${resp.status}]` };
        }
      }

      if (resp.ok && body && body.metrics) {
        setMetrics(body.metrics);
      } else {
        console.error("runBenchmarks failed", resp.status, body);
        const msg = body?.message || body?.errorText || `HTTP ${resp.status}`;
        alert("Run benchmarks failed: " + msg);
      }
    } catch (e) {
      console.error(e);
      alert("Run benchmarks error: " + (e.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h5" gutterBottom>
        ResCanvas Metrics Dashboard
      </Typography>
      <Box sx={{ mb: 2 }}>
        <Button variant="contained" onClick={runBenchmarks} disabled={loading}>
          Run Benchmarks
        </Button>{" "}
        <Button variant="outlined" onClick={fetchLatest} disabled={loading}>
          Refresh Latest
        </Button>
        {loading && <CircularProgress size={20} sx={{ ml: 2 }} />}
      </Box>

      {!metrics && (
        <Paper sx={{ p: 2 }}>
          <Typography>No metrics available. Run benchmarks to produce metrics.</Typography>
        </Paper>
      )}

      {metrics && (
        <Grid container spacing={2}>
          <Grid item xs={12} md={4}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1">Summary</Typography>
              <Typography>Timestamp: {new Date(metrics.timestamp_ms).toLocaleString()}</Typography>
            </Paper>
          </Grid>

          <Grid item xs={12} md={8}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1">Redis Metrics</Typography>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>Ping (ms)</TableCell>
                      <TableCell>{metrics.redis?.ping_ms?.toFixed(2) ?? "—"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>SET avg (ms)</TableCell>
                      <TableCell>{metrics.redis?.set_ms_avg?.toFixed(2) ?? "—"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>GET avg (ms)</TableCell>
                      <TableCell>{metrics.redis?.get_ms_avg?.toFixed(2) ?? "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1">Mongo Metrics</Typography>
              <TableContainer>
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell>Insert avg (ms)</TableCell>
                      <TableCell>{metrics.mongo?.insert_ms_avg?.toFixed(2) ?? "—"}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell>Find avg (ms)</TableCell>
                      <TableCell>{metrics.mongo?.find_ms_avg?.toFixed(2) ?? "—"}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Grid>

          <Grid item xs={12}>
            <Paper sx={{ p: 2 }}>
              <Typography variant="subtitle1">GraphQL Metrics</Typography>
              <Table size="small">
                <TableBody>
                  <TableRow>
                    <TableCell>GraphQL avg (ms)</TableCell>
                    <TableCell>{metrics.graphql?.graphql_ms_avg?.toFixed(2) ?? "—"}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </Paper>
          </Grid>
        </Grid>
      )}
    </Box>
  );
}