#!/usr/bin/env python3
"""
ResCanvas ResilientDB Performance Benchmark Suite

This benchmark simulates realistic ResCanvas drawing workloads against ResilientDB
to compare baseline vs optimized performance configurations.

Usage:
    python resilientdb_benchmark.py [--baseline] [--optimized] [--full] [--threads N]
    
Example:
    python resilientdb_benchmark.py --full --threads 16
"""

import argparse
import asyncio
import json
import os
import random
import statistics
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import requests
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configuration
RESILIENTDB_GRAPHQL_URI = os.getenv("RESILIENTDB_GRAPHQL_URI", "https://cloud.resilientdb.com/graphql")
SIGNER_PUBLIC_KEY = os.getenv("SIGNER_PUBLIC_KEY", "")
SIGNER_PRIVATE_KEY = os.getenv("SIGNER_PRIVATE_KEY", "")
BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:10010")


@dataclass
class StrokeData:
    """Represents a canvas stroke for benchmarking."""
    room_id: str
    drawing_id: str
    color: str
    line_width: int
    path_data: List[Dict[str, float]]
    timestamp: int = field(default_factory=lambda: int(time.time() * 1000))
    user: str = "benchmark_user"
    
    def to_dict(self) -> dict:
        return {
            "roomId": self.room_id,
            "drawingId": self.drawing_id,
            "color": self.color,
            "lineWidth": self.line_width,
            "pathData": self.path_data,
            "timestamp": self.timestamp,
            "user": self.user
        }


@dataclass
class BenchmarkResult:
    """Stores results from a single benchmark run."""
    name: str
    total_transactions: int
    successful_transactions: int
    failed_transactions: int
    total_time_ms: float
    throughput_tps: float
    latencies_ms: List[float]
    p50_latency_ms: float
    p90_latency_ms: float
    p99_latency_ms: float
    avg_latency_ms: float
    min_latency_ms: float
    max_latency_ms: float
    threads: int
    batch_size: int
    config_mode: str
    timestamp: str = field(default_factory=lambda: datetime.now().isoformat())
    
    def to_dict(self) -> dict:
        result = asdict(self)
        result.pop('latencies_ms')  # Don't include raw latencies in JSON
        return result


class GraphQLClient:
    """ResilientDB GraphQL client for transaction submission."""
    
    def __init__(self, endpoint: str = RESILIENTDB_GRAPHQL_URI):
        self.endpoint = endpoint
        self.session = requests.Session()
        
    def post_transaction(self, stroke: StrokeData) -> Tuple[bool, float, Optional[str]]:
        """
        Submit a stroke transaction to ResilientDB.
        
        Returns:
            (success, latency_ms, transaction_id or error)
        """
        mutation = """
        mutation PostTransaction($data: PrepareAsset!) {
            postTransaction(data: $data) {
                id
            }
        }
        """
        
        variables = {
            "data": {
                "id": stroke.drawing_id,
                "operation": "CREATE",
                "amount": 0,
                "signerPublicKey": SIGNER_PUBLIC_KEY,
                "signerPrivateKey": SIGNER_PRIVATE_KEY,
                "recipientPublicKey": SIGNER_PUBLIC_KEY,
                "asset": {
                    "data": {
                        "type": "stroke",
                        "roomId": stroke.room_id,
                        "stroke": stroke.to_dict()
                    }
                }
            }
        }
        
        start_time = time.perf_counter()
        try:
            response = self.session.post(
                self.endpoint,
                json={"query": mutation, "variables": variables},
                headers={"Content-Type": "application/json"},
                timeout=30
            )
            latency_ms = (time.perf_counter() - start_time) * 1000
            
            if response.status_code == 200:
                data = response.json()
                if "errors" in data:
                    return False, latency_ms, str(data["errors"])
                tx_id = data.get("data", {}).get("postTransaction", {}).get("id", "unknown")
                return True, latency_ms, tx_id
            else:
                return False, latency_ms, f"HTTP {response.status_code}"
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            return False, latency_ms, str(e)


class BackendClient:
    """ResCanvas Backend client for stroke submission via Flask API."""
    
    def __init__(self, base_url: str = BACKEND_URL):
        self.base_url = base_url
        self.session = requests.Session()
        self.token: Optional[str] = None
        
    def login(self, username: str = "benchmark", password: str = "benchmark123") -> bool:
        """Authenticate with the backend."""
        try:
            response = self.session.post(
                f"{self.base_url}/api/v1/auth/register",
                json={"username": username, "password": password}
            )
            # If user exists, try login
            if response.status_code != 201:
                response = self.session.post(
                    f"{self.base_url}/api/v1/auth/login",
                    json={"username": username, "password": password}
                )
            
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                self.token = data.get("accessToken") or data.get("access_token")
                return True
        except Exception as e:
            print(f"Login failed: {e}")
        return False
    
    def create_room(self, name: str = "benchmark_room") -> Optional[str]:
        """Create a test room."""
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        try:
            response = self.session.post(
                f"{self.base_url}/rooms",
                json={"name": name, "type": "public"},
                headers=headers
            )
            if response.status_code in (200, 201):
                data = response.json()
                return data.get("roomId") or data.get("id")
        except Exception as e:
            print(f"Room creation failed: {e}")
        return None
    
    def submit_stroke(self, stroke: StrokeData) -> Tuple[bool, float, Optional[str]]:
        """
        Submit a stroke via the Flask backend.
        
        Returns:
            (success, latency_ms, result or error)
        """
        headers = {"Authorization": f"Bearer {self.token}"} if self.token else {}
        
        start_time = time.perf_counter()
        try:
            response = self.session.post(
                f"{self.base_url}/rooms/{stroke.room_id}/strokes",
                json=stroke.to_dict(),
                headers=headers,
                timeout=30
            )
            latency_ms = (time.perf_counter() - start_time) * 1000
            
            if response.status_code in (200, 201):
                return True, latency_ms, "success"
            else:
                return False, latency_ms, f"HTTP {response.status_code}: {response.text[:100]}"
        except Exception as e:
            latency_ms = (time.perf_counter() - start_time) * 1000
            return False, latency_ms, str(e)


def generate_stroke(room_id: str, complexity: str = "medium") -> StrokeData:
    """Generate a random stroke with configurable complexity."""
    
    # Complexity determines number of points in the path
    point_counts = {
        "simple": random.randint(2, 5),
        "medium": random.randint(10, 30),
        "complex": random.randint(50, 150)
    }
    
    num_points = point_counts.get(complexity, 20)
    
    # Generate random path data (simulating brush strokes)
    path_data = []
    x, y = random.uniform(0, 800), random.uniform(0, 600)
    for _ in range(num_points):
        x += random.uniform(-20, 20)
        y += random.uniform(-20, 20)
        x = max(0, min(800, x))
        y = max(0, min(600, y))
        path_data.append({"x": round(x, 2), "y": round(y, 2)})
    
    return StrokeData(
        room_id=room_id,
        drawing_id=str(uuid.uuid4()),
        color=random.choice(["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF", "#000000"]),
        line_width=random.choice([1, 2, 3, 5, 8, 13]),
        path_data=path_data
    )


def run_single_thread_benchmark(
    client: GraphQLClient,
    room_id: str,
    num_transactions: int,
    complexity: str = "medium"
) -> Tuple[int, int, List[float]]:
    """Run benchmark with a single thread."""
    successful = 0
    failed = 0
    latencies = []
    
    for i in range(num_transactions):
        stroke = generate_stroke(room_id, complexity)
        success, latency, _ = client.post_transaction(stroke)
        
        if success:
            successful += 1
        else:
            failed += 1
        latencies.append(latency)
        
        # Progress indicator
        if (i + 1) % 100 == 0:
            print(f"  Progress: {i + 1}/{num_transactions} transactions", end="\r")
    
    print()  # Clear the progress line
    return successful, failed, latencies


def run_multi_thread_benchmark(
    room_id: str,
    num_transactions: int,
    num_threads: int,
    complexity: str = "medium",
    use_backend: bool = False
) -> Tuple[int, int, List[float]]:
    """Run benchmark with multiple threads."""
    successful = 0
    failed = 0
    latencies = []
    
    # Calculate transactions per thread
    txns_per_thread = num_transactions // num_threads
    
    def worker(thread_id: int, count: int) -> Tuple[int, int, List[float]]:
        if use_backend:
            client = BackendClient()
            client.login(f"benchmark_thread_{thread_id}", f"password{thread_id}")
        else:
            client = GraphQLClient()
        
        local_success = 0
        local_fail = 0
        local_latencies = []
        
        for _ in range(count):
            stroke = generate_stroke(room_id, complexity)
            if use_backend:
                success, latency, _ = client.submit_stroke(stroke)
            else:
                success, latency, _ = client.post_transaction(stroke)
            
            if success:
                local_success += 1
            else:
                local_fail += 1
            local_latencies.append(latency)
        
        return local_success, local_fail, local_latencies
    
    with ThreadPoolExecutor(max_workers=num_threads) as executor:
        futures = [
            executor.submit(worker, i, txns_per_thread)
            for i in range(num_threads)
        ]
        
        for future in as_completed(futures):
            s, f, lats = future.result()
            successful += s
            failed += f
            latencies.extend(lats)
    
    return successful, failed, latencies


def calculate_percentile(data: List[float], percentile: float) -> float:
    """Calculate the given percentile of a list."""
    if not data:
        return 0.0
    sorted_data = sorted(data)
    index = int(len(sorted_data) * percentile / 100)
    return sorted_data[min(index, len(sorted_data) - 1)]


def run_benchmark(
    name: str,
    num_transactions: int,
    num_threads: int = 1,
    batch_size: int = 1,
    config_mode: str = "baseline",
    complexity: str = "medium",
    use_backend: bool = False
) -> BenchmarkResult:
    """
    Execute a complete benchmark run.
    
    Args:
        name: Descriptive name for the benchmark
        num_transactions: Total number of transactions to submit
        num_threads: Number of concurrent threads
        batch_size: Logical batch size (for configuration comparison)
        config_mode: "baseline" or "optimized"
        complexity: Stroke complexity (simple, medium, complex)
        use_backend: Whether to use Flask backend or direct GraphQL
    """
    room_id = f"benchmark_{uuid.uuid4().hex[:8]}"
    
    print(f"\n{'='*60}")
    print(f"📊 Running Benchmark: {name}")
    print(f"{'='*60}")
    print(f"  Transactions: {num_transactions}")
    print(f"  Threads: {num_threads}")
    print(f"  Complexity: {complexity}")
    print(f"  Mode: {config_mode}")
    print(f"  Client: {'Flask Backend' if use_backend else 'Direct GraphQL'}")
    print(f"{'='*60}")
    
    start_time = time.perf_counter()
    
    if num_threads == 1:
        client = GraphQLClient() if not use_backend else BackendClient()
        if use_backend:
            client.login()
        successful, failed, latencies = run_single_thread_benchmark(
            client, room_id, num_transactions, complexity
        )
    else:
        successful, failed, latencies = run_multi_thread_benchmark(
            room_id, num_transactions, num_threads, complexity, use_backend
        )
    
    total_time = (time.perf_counter() - start_time) * 1000
    throughput = (num_transactions / total_time) * 1000 if total_time > 0 else 0
    
    result = BenchmarkResult(
        name=name,
        total_transactions=num_transactions,
        successful_transactions=successful,
        failed_transactions=failed,
        total_time_ms=total_time,
        throughput_tps=throughput,
        latencies_ms=latencies,
        p50_latency_ms=calculate_percentile(latencies, 50),
        p90_latency_ms=calculate_percentile(latencies, 90),
        p99_latency_ms=calculate_percentile(latencies, 99),
        avg_latency_ms=statistics.mean(latencies) if latencies else 0,
        min_latency_ms=min(latencies) if latencies else 0,
        max_latency_ms=max(latencies) if latencies else 0,
        threads=num_threads,
        batch_size=batch_size,
        config_mode=config_mode
    )
    
    print_result(result)
    return result


def print_result(result: BenchmarkResult):
    """Print benchmark result in a formatted table."""
    success_rate = (result.successful_transactions / result.total_transactions * 100) if result.total_transactions > 0 else 0
    
    print(f"\n📈 Results: {result.name}")
    print(f"{'─'*50}")
    print(f"  ✅ Successful: {result.successful_transactions}/{result.total_transactions} ({success_rate:.1f}%)")
    print(f"  ⏱️  Total Time: {result.total_time_ms:.2f} ms")
    print(f"  🚀 Throughput: {result.throughput_tps:.2f} TPS")
    print(f"  📊 Latency (ms):")
    print(f"      P50: {result.p50_latency_ms:.2f}")
    print(f"      P90: {result.p90_latency_ms:.2f}")
    print(f"      P99: {result.p99_latency_ms:.2f}")
    print(f"      Avg: {result.avg_latency_ms:.2f}")
    print(f"      Min: {result.min_latency_ms:.2f}")
    print(f"      Max: {result.max_latency_ms:.2f}")
    print(f"{'─'*50}")


def generate_html_report(results: List[BenchmarkResult], output_file: str = "benchmark_report.html"):
    """Generate an interactive HTML report with charts."""
    
    # Prepare data for charts
    labels = [r.name for r in results]
    throughput_data = [r.throughput_tps for r in results]
    p50_data = [r.p50_latency_ms for r in results]
    p99_data = [r.p99_latency_ms for r in results]
    success_rates = [(r.successful_transactions / r.total_transactions * 100) if r.total_transactions > 0 else 0 for r in results]
    
    html = f"""
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ResCanvas ResilientDB Benchmark Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
            background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
            min-height: 100vh;
            color: #e0e0e0;
            padding: 2rem;
        }}
        .container {{
            max-width: 1400px;
            margin: 0 auto;
        }}
        header {{
            text-align: center;
            margin-bottom: 2rem;
        }}
        h1 {{
            font-size: 2.5rem;
            background: linear-gradient(90deg, #00d4ff, #7c3aed);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin-bottom: 0.5rem;
        }}
        .timestamp {{
            color: #888;
            font-size: 0.9rem;
        }}
        .grid {{
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
            gap: 1.5rem;
            margin-bottom: 2rem;
        }}
        .card {{
            background: rgba(255, 255, 255, 0.05);
            border-radius: 16px;
            padding: 1.5rem;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
        }}
        .card h2 {{
            color: #00d4ff;
            margin-bottom: 1rem;
            font-size: 1.2rem;
        }}
        .chart-container {{
            position: relative;
            height: 300px;
        }}
        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 0.9rem;
        }}
        th, td {{
            padding: 0.75rem;
            text-align: left;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        }}
        th {{
            background: rgba(0, 212, 255, 0.2);
            color: #00d4ff;
        }}
        tr:hover {{
            background: rgba(255, 255, 255, 0.05);
        }}
        .metric-value {{
            font-size: 1.5rem;
            font-weight: bold;
            color: #00d4ff;
        }}
        .summary-grid {{
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 1rem;
            margin-bottom: 2rem;
        }}
        .summary-card {{
            background: rgba(255, 255, 255, 0.05);
            border-radius: 12px;
            padding: 1rem;
            text-align: center;
        }}
        .summary-card h3 {{
            color: #888;
            font-size: 0.8rem;
            margin-bottom: 0.5rem;
        }}
        .improvement {{
            color: #4ade80;
        }}
        .degradation {{
            color: #f87171;
        }}
    </style>
</head>
<body>
    <div class="container">
        <header>
            <h1>🎨 ResCanvas ResilientDB Benchmark Report</h1>
            <p class="timestamp">Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
        </header>
        
        <div class="summary-grid">
            <div class="summary-card">
                <h3>Total Tests</h3>
                <div class="metric-value">{len(results)}</div>
            </div>
            <div class="summary-card">
                <h3>Peak TPS</h3>
                <div class="metric-value">{max(throughput_data):.0f}</div>
            </div>
            <div class="summary-card">
                <h3>Best P99 Latency</h3>
                <div class="metric-value">{min(p99_data):.1f} ms</div>
            </div>
            <div class="summary-card">
                <h3>Avg Success Rate</h3>
                <div class="metric-value">{statistics.mean(success_rates):.1f}%</div>
            </div>
        </div>
        
        <div class="grid">
            <div class="card">
                <h2>📊 Throughput Comparison (TPS)</h2>
                <div class="chart-container">
                    <canvas id="throughputChart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h2>⏱️ Latency Distribution (ms)</h2>
                <div class="chart-container">
                    <canvas id="latencyChart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h2>✅ Success Rates (%)</h2>
                <div class="chart-container">
                    <canvas id="successChart"></canvas>
                </div>
            </div>
            
            <div class="card">
                <h2>🔄 Configuration Comparison</h2>
                <div class="chart-container">
                    <canvas id="comparisonChart"></canvas>
                </div>
            </div>
        </div>
        
        <div class="card">
            <h2>📋 Detailed Results</h2>
            <table>
                <thead>
                    <tr>
                        <th>Test Name</th>
                        <th>TPS</th>
                        <th>P50 (ms)</th>
                        <th>P99 (ms)</th>
                        <th>Success</th>
                        <th>Threads</th>
                        <th>Mode</th>
                    </tr>
                </thead>
                <tbody>
                    {''.join([f'''
                    <tr>
                        <td>{r.name}</td>
                        <td>{r.throughput_tps:.1f}</td>
                        <td>{r.p50_latency_ms:.2f}</td>
                        <td>{r.p99_latency_ms:.2f}</td>
                        <td>{r.successful_transactions}/{r.total_transactions}</td>
                        <td>{r.threads}</td>
                        <td>{r.config_mode}</td>
                    </tr>''' for r in results])}
                </tbody>
            </table>
        </div>
    </div>
    
    <script>
        const labels = {json.dumps(labels)};
        const throughputData = {json.dumps(throughput_data)};
        const p50Data = {json.dumps(p50_data)};
        const p99Data = {json.dumps(p99_data)};
        const successData = {json.dumps(success_rates)};
        
        Chart.defaults.color = '#888';
        Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';
        
        // Throughput Chart
        new Chart(document.getElementById('throughputChart'), {{
            type: 'bar',
            data: {{
                labels: labels,
                datasets: [{{
                    label: 'Throughput (TPS)',
                    data: throughputData,
                    backgroundColor: 'rgba(0, 212, 255, 0.6)',
                    borderColor: '#00d4ff',
                    borderWidth: 2
                }}]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {{
                    legend: {{ display: false }}
                }},
                scales: {{
                    y: {{ beginAtZero: true }}
                }}
            }}
        }});
        
        // Latency Chart
        new Chart(document.getElementById('latencyChart'), {{
            type: 'bar',
            data: {{
                labels: labels,
                datasets: [
                    {{
                        label: 'P50',
                        data: p50Data,
                        backgroundColor: 'rgba(74, 222, 128, 0.6)',
                        borderColor: '#4ade80',
                        borderWidth: 1
                    }},
                    {{
                        label: 'P99',
                        data: p99Data,
                        backgroundColor: 'rgba(248, 113, 113, 0.6)',
                        borderColor: '#f87171',
                        borderWidth: 1
                    }}
                ]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                scales: {{
                    y: {{ beginAtZero: true }}
                }}
            }}
        }});
        
        // Success Rate Chart
        new Chart(document.getElementById('successChart'), {{
            type: 'doughnut',
            data: {{
                labels: labels,
                datasets: [{{
                    data: successData,
                    backgroundColor: [
                        'rgba(0, 212, 255, 0.7)',
                        'rgba(124, 58, 237, 0.7)',
                        'rgba(74, 222, 128, 0.7)',
                        'rgba(251, 191, 36, 0.7)',
                        'rgba(248, 113, 113, 0.7)',
                        'rgba(139, 92, 246, 0.7)'
                    ]
                }}]
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false
            }}
        }});
        
        // Comparison Chart
        new Chart(document.getElementById('comparisonChart'), {{
            type: 'radar',
            data: {{
                labels: ['TPS', 'Low P50', 'Low P99', 'Success %', 'Consistency'],
                datasets: labels.slice(0, 3).map((name, i) => ({{
                    label: name,
                    data: [
                        throughputData[i] / Math.max(...throughputData) * 100,
                        (1 - p50Data[i] / Math.max(...p50Data)) * 100,
                        (1 - p99Data[i] / Math.max(...p99Data)) * 100,
                        successData[i],
                        (1 - (p99Data[i] - p50Data[i]) / Math.max(...p99Data)) * 100
                    ],
                    borderColor: ['#00d4ff', '#7c3aed', '#4ade80'][i],
                    backgroundColor: [`rgba(0,212,255,0.1)`, `rgba(124,58,237,0.1)`, `rgba(74,222,128,0.1)`][i]
                }}))
            }},
            options: {{
                responsive: true,
                maintainAspectRatio: false,
                scales: {{
                    r: {{
                        beginAtZero: true,
                        max: 100
                    }}
                }}
            }}
        }});
    </script>
</body>
</html>
"""
    
    with open(output_file, 'w') as f:
        f.write(html)
    
    print(f"\n📊 HTML report saved: {output_file}")


def generate_json_report(results: List[BenchmarkResult], output_file: str = "benchmark_results.json"):
    """Generate a JSON report for programmatic consumption."""
    
    report = {
        "generated_at": datetime.now().isoformat(),
        "summary": {
            "total_benchmarks": len(results),
            "peak_tps": max(r.throughput_tps for r in results),
            "best_p99_latency_ms": min(r.p99_latency_ms for r in results),
            "total_transactions": sum(r.total_transactions for r in results),
            "total_successful": sum(r.successful_transactions for r in results)
        },
        "benchmarks": [r.to_dict() for r in results]
    }
    
    with open(output_file, 'w') as f:
        json.dump(report, f, indent=2)
    
    print(f"📁 JSON report saved: {output_file}")


def main():
    parser = argparse.ArgumentParser(description="ResCanvas ResilientDB Performance Benchmark")
    parser.add_argument("--baseline", action="store_true", help="Run baseline benchmark only")
    parser.add_argument("--optimized", action="store_true", help="Run optimized benchmark only")
    parser.add_argument("--full", action="store_true", help="Run full benchmark suite")
    parser.add_argument("--threads", type=int, default=4, help="Number of threads (default: 4)")
    parser.add_argument("--transactions", type=int, default=100, help="Transactions per test (default: 100)")
    parser.add_argument("--use-backend", action="store_true", help="Use Flask backend instead of direct GraphQL")
    parser.add_argument("--output-dir", type=str, default=".", help="Output directory for reports")
    
    args = parser.parse_args()
    
    print("\n" + "="*60)
    print("🎨 ResCanvas ResilientDB Performance Benchmark Suite")
    print("="*60)
    
    if not SIGNER_PUBLIC_KEY or not SIGNER_PRIVATE_KEY:
        print("\n⚠️  Warning: SIGNER_PUBLIC_KEY and SIGNER_PRIVATE_KEY not set.")
        print("   Direct GraphQL benchmarks may fail. Use --use-backend for Flask API testing.")
    
    results: List[BenchmarkResult] = []
    
    if args.baseline or (not args.baseline and not args.optimized):
        # Baseline benchmarks (single-thread, small batches)
        results.append(run_benchmark(
            name="Baseline Single-Thread",
            num_transactions=args.transactions,
            num_threads=1,
            config_mode="baseline",
            complexity="medium",
            use_backend=args.use_backend
        ))
    
    if args.optimized or (not args.baseline and not args.optimized):
        # Optimized benchmarks (multi-thread, larger batches)
        results.append(run_benchmark(
            name=f"Optimized {args.threads}-Thread",
            num_transactions=args.transactions,
            num_threads=args.threads,
            config_mode="optimized",
            complexity="medium",
            use_backend=args.use_backend
        ))
    
    if args.full:
        # Full benchmark suite
        additional_tests = [
            ("High Concurrency", args.threads * 2, "medium"),
            ("Simple Strokes", args.threads, "simple"),
            ("Complex Strokes", args.threads, "complex"),
            ("Stress Test", 1, "medium"),  # Single thread, max load
        ]
        
        for name, threads, complexity in additional_tests:
            results.append(run_benchmark(
                name=name,
                num_transactions=args.transactions,
                num_threads=threads,
                config_mode="optimized" if threads > 1 else "baseline",
                complexity=complexity,
                use_backend=args.use_backend
            ))
    
    # Generate reports
    output_dir = args.output_dir
    generate_html_report(results, os.path.join(output_dir, "rescanvas_benchmark_report.html"))
    generate_json_report(results, os.path.join(output_dir, "rescanvas_benchmark_results.json"))
    
    # Print summary
    print("\n" + "="*60)
    print("📊 BENCHMARK SUMMARY")
    print("="*60)
    
    best_throughput = max(results, key=lambda r: r.throughput_tps)
    best_latency = min(results, key=lambda r: r.p99_latency_ms)
    
    print(f"\n🏆 Best Throughput: {best_throughput.name}")
    print(f"   {best_throughput.throughput_tps:.2f} TPS")
    
    print(f"\n⚡ Best P99 Latency: {best_latency.name}")
    print(f"   {best_latency.p99_latency_ms:.2f} ms")
    
    if len(results) >= 2:
        baseline = results[0]
        optimized = results[1]
        improvement = ((optimized.throughput_tps - baseline.throughput_tps) / baseline.throughput_tps * 100) if baseline.throughput_tps > 0 else 0
        print(f"\n📈 Throughput Improvement: {improvement:+.1f}%")
    
    print("\n" + "="*60)
    print("✅ Benchmark suite complete!")
    print("="*60)


if __name__ == "__main__":
    main()
