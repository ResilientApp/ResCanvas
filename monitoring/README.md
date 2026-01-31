# ResCanvas & ResilientDB Performance Monitoring

This directory contains a complete production-grade monitoring stack for ResCanvas and ResilientDB.

## 🚀 Quick Start

### Start Monitoring Stack

```bash
cd ResCanvas/monitoring
docker-compose up -d
```

**Access Points:**
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (login: admin/admin)

### Stop Monitoring Stack

```bash
docker-compose down
```

---

## 📊 Dashboards

### ResCanvas Dashboard
- **UID**: `rescanvas-perf-001`
- **Metrics**: Stroke rates, API latency, cache hit ratios, active rooms/users
- **Location**: [grafana/rescanvas_dashboard.json](grafana/rescanvas_dashboard.json)

### ResilientDB Dashboard
- **UID**: `resdb-perf-001`
- **Metrics**: TPS, consensus latency, batch sizes, PBFT message rates
- **Location**: [../incubator-resilientdb/monitoring/grafana/resilientdb_dashboard.json](../../incubator-resilientdb/monitoring/grafana/resilientdb_dashboard.json)

---

## 📈 Metrics Reference

### ResCanvas Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `strokes_total` | Counter | Total strokes submitted |
| `strokes_failed_total` | Counter | Failed stroke submissions |
| `stroke_submit_duration_seconds` | Histogram | Stroke submission latency |
| `http_requests_total` | Counter | Total HTTP requests |
| `http_request_duration_seconds` | Histogram | HTTP request latency |
| `resilientdb_transactions_total` | Counter | Transactions to ResilientDB |
| `resilientdb_transaction_duration_seconds` | Histogram | ResilientDB latency |
| `graphql_mutation_duration_seconds` | Histogram | GraphQL mutation latency |
| `cache_hits_total` | Counter | Redis cache hits |
| `cache_misses_total` | Counter | Redis cache misses |
| `socket_events_total` | Counter | Socket.IO events processed |
| `active_rooms` | Gauge | Currently active drawing rooms |
| `active_users` | Gauge | Currently connected users |

### ResilientDB Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `resdb_tps` | Gauge | Current transactions per second |
| `resdb_transactions_total` | Counter | Total committed transactions |
| `resdb_transaction_latency_ms` | Histogram | Transaction latency distribution |
| `resdb_batch_size` | Histogram | Batch size distribution |
| `resdb_batch_total` | Counter | Total batches processed |
| `resdb_consensus_rounds_total` | Counter | PBFT consensus rounds |
| `resdb_consensus_latency_ms` | Histogram | Consensus round latency |
| `resdb_pre_prepare_total` | Counter | PRE-PREPARE messages |
| `resdb_prepare_total` | Counter | PREPARE messages |
| `resdb_commit_total` | Counter | COMMIT messages |
| `resdb_cache_hit_ratio` | Gauge | Storage cache hit ratio |

---

## 🔧 Configuration

### Prometheus Configuration

Edit `prometheus/prometheus.yml` to add or modify scrape targets:

```yaml
scrape_configs:
  - job_name: 'rescanvas'
    static_configs:
      - targets: ['host.docker.internal:10010']
    metrics_path: /metrics
    scrape_interval: 5s
```

### Grafana Provisioning

Dashboards are automatically loaded from:
- `grafana/provisioning/datasources/` - Data source configuration
- `grafana/provisioning/dashboards/` - Dashboard provider configuration
- `grafana/` - Dashboard JSON files

---

## 🧪 Running Benchmarks

### ResilientDB C++ Benchmark

```bash
cd incubator-resilientdb
bazel build //benchmark/rescanvas:performance_benchmark
./bazel-bin/benchmark/rescanvas/performance_benchmark
```

Output: `benchmark_results.json`, `benchmark_report.html`

### ResCanvas Python Benchmark

```bash
cd ResCanvas/backend
source venv/bin/activate
python benchmarks/resilientdb_benchmark.py --full --threads 8 --transactions 500
```

Options:
- `--baseline` - Run baseline (single-thread) only
- `--optimized` - Run optimized (multi-thread) only
- `--full` - Run complete benchmark suite
- `--threads N` - Number of concurrent threads
- `--transactions N` - Transactions per test
- `--use-backend` - Use Flask API instead of direct GraphQL

Output: `rescanvas_benchmark_report.html`, `rescanvas_benchmark_results.json`

---

## 📁 Directory Structure

```
monitoring/
├── docker-compose.yml          # Docker Compose for Prometheus + Grafana
├── prometheus/
│   └── prometheus.yml          # Prometheus scrape configuration
├── grafana/
│   ├── rescanvas_dashboard.json    # Main ResCanvas dashboard
│   └── provisioning/
│       ├── datasources/
│       │   └── datasources.yml     # Prometheus datasource
│       └── dashboards/
│           └── dashboards.yml      # Dashboard auto-load config
└── README.md                   # This file
```

---

## 🔗 Integration with Backend

### Enable Metrics Endpoint

Add to `backend/app.py`:

```python
from routes.metrics_endpoint import register_metrics_blueprint

app = Flask(__name__)
register_metrics_blueprint(app)
```

### Use Metrics in Code

```python
from services.metrics import metrics, track_request

# Track latency with context manager
with metrics.timer("stroke_submit_duration_seconds"):
    result = submit_stroke(stroke_data)

# Track latency with decorator
@track_request("http_request_duration_seconds")
def handle_request():
    pass

# Increment counter
metrics.increment("strokes_total")

# Set gauge
metrics.set_gauge("active_rooms", len(rooms))
```

---

## 📊 Sample Queries

### PromQL Examples

```promql
# Stroke submission rate (per minute)
rate(strokes_total[1m]) * 60

# P99 latency
histogram_quantile(0.99, rate(stroke_submit_duration_seconds_bucket[5m]))

# Cache hit ratio
rate(cache_hits_total[5m]) / (rate(cache_hits_total[5m]) + rate(cache_misses_total[5m]))

# Error rate
rate(strokes_failed_total[5m]) / rate(strokes_total[5m])

# ResilientDB TPS
rate(resilientdb_transactions_total[1m])
```

---

## 🐳 Production Deployment

For production, consider:

1. **Persistent Storage**: Mount volumes for Prometheus and Grafana data
2. **Alerting**: Configure AlertManager for critical metrics
3. **Authentication**: Enable Grafana authentication
4. **TLS**: Use HTTPS for all endpoints
5. **Retention**: Configure appropriate data retention periods

```yaml
# Example production additions to docker-compose.yml
services:
  alertmanager:
    image: prom/alertmanager:v0.25.0
    ports:
      - "9093:9093"
    volumes:
      - ./alertmanager/alertmanager.yml:/etc/alertmanager/alertmanager.yml
```

---

## 📝 License

Apache License 2.0 - See LICENSE files in respective repositories.
