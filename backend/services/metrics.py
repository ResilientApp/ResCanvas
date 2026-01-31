"""
Prometheus Metrics Exporter for ResCanvas Backend

This module provides production-grade metrics collection and Prometheus-compatible
export for monitoring ResCanvas performance against ResilientDB.

Metrics tracked:
- HTTP request latency (by endpoint)
- Stroke submission latency
- ResilientDB transaction latency
- Active rooms and users
- Cache hit/miss ratios
- Error rates

Usage:
    from services.metrics import metrics
    
    # Record latency
    with metrics.timer("stroke_submit"):
        # ... submit stroke
    
    # Increment counter
    metrics.increment("strokes_total")
    
    # Set gauge
    metrics.set_gauge("active_rooms", len(rooms))
"""

import time
import threading
from collections import defaultdict
from typing import Dict, List, Optional
from dataclasses import dataclass, field
from functools import wraps


@dataclass
class Histogram:
    """Tracks value distributions with configurable buckets."""
    name: str
    buckets: List[float] = field(default_factory=lambda: [
        0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0
    ])
    _values: List[float] = field(default_factory=list)
    _lock: threading.Lock = field(default_factory=threading.Lock)
    
    def observe(self, value: float):
        """Record a value in the histogram."""
        with self._lock:
            self._values.append(value)
            # Keep only recent values (sliding window)
            if len(self._values) > 10000:
                self._values = self._values[-5000:]
    
    def get_bucket_counts(self) -> Dict[float, int]:
        """Get counts for each bucket."""
        with self._lock:
            counts = {b: 0 for b in self.buckets}
            counts[float('inf')] = 0
            
            for v in self._values:
                for bucket in self.buckets:
                    if v <= bucket:
                        counts[bucket] += 1
                        break
                else:
                    counts[float('inf')] += 1
            
            return counts
    
    def get_percentile(self, p: float) -> float:
        """Get the p-th percentile value."""
        with self._lock:
            if not self._values:
                return 0.0
            sorted_vals = sorted(self._values)
            idx = int(len(sorted_vals) * p / 100)
            return sorted_vals[min(idx, len(sorted_vals) - 1)]
    
    def get_sum(self) -> float:
        """Get sum of all values."""
        with self._lock:
            return sum(self._values)
    
    def get_count(self) -> int:
        """Get count of all values."""
        with self._lock:
            return len(self._values)


@dataclass
class Counter:
    """Monotonically increasing counter."""
    name: str
    _value: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)
    
    def inc(self, amount: float = 1.0):
        """Increment the counter."""
        with self._lock:
            self._value += amount
    
    def get(self) -> float:
        """Get current value."""
        with self._lock:
            return self._value


@dataclass
class Gauge:
    """Value that can go up and down."""
    name: str
    _value: float = 0.0
    _lock: threading.Lock = field(default_factory=threading.Lock)
    
    def set(self, value: float):
        """Set the gauge value."""
        with self._lock:
            self._value = value
    
    def inc(self, amount: float = 1.0):
        """Increment the gauge."""
        with self._lock:
            self._value += amount
    
    def dec(self, amount: float = 1.0):
        """Decrement the gauge."""
        with self._lock:
            self._value -= amount
    
    def get(self) -> float:
        """Get current value."""
        with self._lock:
            return self._value


class PrometheusMetrics:
    """
    Thread-safe metrics collection with Prometheus-compatible export.
    
    Singleton pattern ensures consistent metrics across the application.
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        if self._initialized:
            return
        
        self._initialized = True
        self._histograms: Dict[str, Histogram] = {}
        self._counters: Dict[str, Counter] = {}
        self._gauges: Dict[str, Gauge] = {}
        self._labels: Dict[str, Dict[str, str]] = {}
        self._metrics_lock = threading.Lock()
        
        # Initialize default metrics
        self._init_default_metrics()
    
    def _init_default_metrics(self):
        """Initialize standard ResCanvas metrics."""
        
        # Request latency histograms
        latency_buckets = [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
        
        self.register_histogram("http_request_duration_seconds", buckets=latency_buckets)
        self.register_histogram("stroke_submit_duration_seconds", buckets=latency_buckets)
        self.register_histogram("resilientdb_transaction_duration_seconds", buckets=latency_buckets)
        self.register_histogram("graphql_mutation_duration_seconds", buckets=latency_buckets)
        
        # Counters
        self.register_counter("http_requests_total")
        self.register_counter("strokes_total")
        self.register_counter("strokes_failed_total")
        self.register_counter("resilientdb_transactions_total")
        self.register_counter("resilientdb_transactions_failed_total")
        self.register_counter("cache_hits_total")
        self.register_counter("cache_misses_total")
        self.register_counter("socket_events_total")
        self.register_counter("socket_connections_total")
        self.register_counter("socket_disconnections_total")
        
        # Gauges
        self.register_gauge("active_rooms")
        self.register_gauge("active_users")
        self.register_gauge("socket_connected_clients")
        self.register_gauge("pending_transactions")
        self.register_gauge("cache_size_bytes")
        self.register_gauge("current_tps")
    
    def register_histogram(self, name: str, buckets: Optional[List[float]] = None) -> Histogram:
        """Register a new histogram metric."""
        with self._metrics_lock:
            if name not in self._histograms:
                self._histograms[name] = Histogram(
                    name=name,
                    buckets=buckets or [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0]
                )
            return self._histograms[name]
    
    def register_counter(self, name: str) -> Counter:
        """Register a new counter metric."""
        with self._metrics_lock:
            if name not in self._counters:
                self._counters[name] = Counter(name=name)
            return self._counters[name]
    
    def register_gauge(self, name: str) -> Gauge:
        """Register a new gauge metric."""
        with self._metrics_lock:
            if name not in self._gauges:
                self._gauges[name] = Gauge(name=name)
            return self._gauges[name]
    
    def observe(self, name: str, value: float):
        """Record a value in a histogram."""
        if name in self._histograms:
            self._histograms[name].observe(value)
    
    def increment(self, name: str, amount: float = 1.0):
        """Increment a counter."""
        if name in self._counters:
            self._counters[name].inc(amount)
    
    def set_gauge(self, name: str, value: float):
        """Set a gauge value."""
        if name in self._gauges:
            self._gauges[name].set(value)
    
    def inc_gauge(self, name: str, amount: float = 1.0):
        """Increment a gauge."""
        if name in self._gauges:
            self._gauges[name].inc(amount)
    
    def dec_gauge(self, name: str, amount: float = 1.0):
        """Decrement a gauge."""
        if name in self._gauges:
            self._gauges[name].dec(amount)
    
    def timer(self, metric_name: str):
        """
        Context manager for timing operations.
        
        Usage:
            with metrics.timer("stroke_submit_duration_seconds"):
                submit_stroke()
        """
        return _Timer(self, metric_name)
    
    def timed(self, metric_name: str):
        """
        Decorator for timing functions.
        
        Usage:
            @metrics.timed("stroke_submit_duration_seconds")
            def submit_stroke():
                ...
        """
        def decorator(func):
            @wraps(func)
            def wrapper(*args, **kwargs):
                with self.timer(metric_name):
                    return func(*args, **kwargs)
            return wrapper
        return decorator
    
    def get_prometheus_format(self) -> str:
        """
        Export all metrics in Prometheus text format.
        
        Returns:
            String in Prometheus exposition format
        """
        lines = []
        lines.append("# ResCanvas ResilientDB Metrics")
        lines.append(f"# Generated at: {time.strftime('%Y-%m-%d %H:%M:%S')}")
        lines.append("")
        
        # Export counters
        for name, counter in self._counters.items():
            lines.append(f"# HELP {name} Counter metric")
            lines.append(f"# TYPE {name} counter")
            lines.append(f"{name} {counter.get()}")
            lines.append("")
        
        # Export gauges
        for name, gauge in self._gauges.items():
            lines.append(f"# HELP {name} Gauge metric")
            lines.append(f"# TYPE {name} gauge")
            lines.append(f"{name} {gauge.get()}")
            lines.append("")
        
        # Export histograms
        for name, histogram in self._histograms.items():
            lines.append(f"# HELP {name} Histogram metric")
            lines.append(f"# TYPE {name} histogram")
            
            bucket_counts = histogram.get_bucket_counts()
            cumulative = 0
            # Sort buckets, putting +Inf last
            sorted_buckets = sorted([b for b in bucket_counts.keys() if b != float('inf')])
            sorted_buckets.append(float('inf'))
            
            for bucket in sorted_buckets:
                count = bucket_counts.get(bucket, 0)
                cumulative += count
                bucket_label = "+Inf" if bucket == float('inf') else str(bucket)
                lines.append(f'{name}_bucket{{le="{bucket_label}"}} {cumulative}')
            
            lines.append(f"{name}_sum {histogram.get_sum()}")
            lines.append(f"{name}_count {histogram.get_count()}")
            lines.append("")
        
        return "\n".join(lines)
    
    def get_json_format(self) -> dict:
        """
        Export all metrics in JSON format.
        
        Returns:
            Dictionary with all metrics
        """
        return {
            "generated_at": time.strftime('%Y-%m-%d %H:%M:%S'),
            "counters": {name: counter.get() for name, counter in self._counters.items()},
            "gauges": {name: gauge.get() for name, gauge in self._gauges.items()},
            "histograms": {
                name: {
                    "count": histogram.get_count(),
                    "sum": histogram.get_sum(),
                    "p50": histogram.get_percentile(50),
                    "p90": histogram.get_percentile(90),
                    "p99": histogram.get_percentile(99),
                }
                for name, histogram in self._histograms.items()
            }
        }


class _Timer:
    """Context manager for timing operations."""
    
    def __init__(self, metrics: PrometheusMetrics, metric_name: str):
        self.metrics = metrics
        self.metric_name = metric_name
        self.start_time = None
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        duration = time.perf_counter() - self.start_time
        self.metrics.observe(self.metric_name, duration)
        return False


# Global metrics instance
metrics = PrometheusMetrics()


# Flask route decorator for auto-timing
def track_request(metric_name: str = "http_request_duration_seconds"):
    """
    Flask route decorator that automatically tracks request latency.
    
    Usage:
        @app.route("/api/strokes")
        @track_request()
        def submit_stroke():
            ...
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            metrics.increment("http_requests_total")
            with metrics.timer(metric_name):
                return func(*args, **kwargs)
        return wrapper
    return decorator
