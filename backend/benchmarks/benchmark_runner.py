"""
Lightweight benchmark runner for ResCanvas.

Provides functions to measure:
- Redis basic ping / set / get latency
- Mongo insert / find latency (using strokes_coll)
- GraphQL endpoint request latency

Stores the latest metrics JSON into Redis under key 'rescanvas:metrics:latest'.
"""
import time
import json
import random
import logging
from typing import Dict

from services.db import redis_client, strokes_coll
from config import GRAPHQL_URL, HEADERS
import requests

logger = logging.getLogger(__name__)


def _now_ms():
  return int(time.time() * 1000)


def time_redis(rcli, rounds=20) -> Dict:
  """Measure a few simple Redis operations."""
  metrics = {"ping_ms": None, "set_ms_avg": None, "get_ms_avg": None, "rounds": rounds}

  try:
      # Ping
      t0 = time.time()
      rcli.ping()
      t1 = time.time()
      metrics["ping_ms"] = (t1 - t0) * 1000.0

      set_times = []
      get_times = []
      for i in range(rounds):
          key = f"bench:redis:test:{random.randint(1,1000000)}"
          val = str(i) + "-" + str(random.random())
          t0 = time.time()
          rcli.set(key, val)
          t1 = time.time()
          set_times.append((t1 - t0) * 1000.0)

          t0 = time.time()
          _ = rcli.get(key)
          t1 = time.time()
          get_times.append((t1 - t0) * 1000.0)

      metrics["set_ms_avg"] = sum(set_times) / len(set_times)
      metrics["get_ms_avg"] = sum(get_times) / len(get_times)
  except Exception as e:
      logger.exception("Redis benchmark failed")
      metrics["error"] = str(e)

  return metrics


def time_mongo(coll, rounds=20) -> Dict:
  """Measure Mongo insert and find latency using the strokes collection."""
  metrics = {"insert_ms_avg": None, "find_ms_avg": None, "rounds": rounds}
  try:
      insert_times = []
      find_times = []
      for i in range(rounds):
          doc = {"bench": True, "i": i, "ts": _now_ms(), "random": random.random()}
          t0 = time.time()
          res = coll.insert_one(doc)
          t1 = time.time()
          insert_times.append((t1 - t0) * 1000.0)

          t0 = time.time()
          _ = coll.find_one({"_id": res.inserted_id})
          t1 = time.time()
          find_times.append((t1 - t0) * 1000.0)

      metrics["insert_ms_avg"] = sum(insert_times) / len(insert_times)
      metrics["find_ms_avg"] = sum(find_times) / len(find_times)
  except Exception as e:
      logger.exception("Mongo benchmark failed")
      metrics["error"] = str(e)

  return metrics


def time_graphql(graphql_url: str, rounds=3) -> Dict:
  """Measure GraphQL endpoint basic POST latency. We do a simple GET or empty POST depending on availability."""
  metrics = {"graphql_ms_avg": None, "rounds": rounds}
  if not graphql_url:
      metrics["error"] = "GRAPHQL URL not configured"
      return metrics

  times = []
  for i in range(rounds):
      try:
          t0 = time.time()
          # Try a lightweight POST with a simple introspection-like query when possible
          payload = {"query": "{ __typename }"}
          resp = requests.post(graphql_url, json=payload, headers=HEADERS, timeout=10)
          t1 = time.time()
          times.append((t1 - t0) * 1000.0)
      except Exception:
          # Try a GET fallback (some endpoints may accept)
          try:
              t0 = time.time()
              resp = requests.get(graphql_url, timeout=10)
              t1 = time.time()
              times.append((t1 - t0) * 1000.0)
          except Exception as e:
              logger.exception("GraphQL ping failed")
              metrics["error"] = str(e)
              break

  if times:
      metrics["graphql_ms_avg"] = sum(times) / len(times)

  return metrics


def run_all(rounds_redis=20, rounds_mongo=20, rounds_graphql=3) -> Dict:
  """Run all benchmarks and return an aggregated JSON object."""
  result = {
      "timestamp_ms": _now_ms(),
      "redis": None,
      "mongo": None,
      "graphql": None,
  }

  result["redis"] = time_redis(redis_client, rounds=rounds_redis)
  result["mongo"] = time_mongo(strokes_coll, rounds=rounds_mongo)
  result["graphql"] = time_graphql(GRAPHQL_URL, rounds=rounds_graphql)

  # store latest in redis (best-effort)
  try:
      redis_client.set("rescanvas:metrics:latest", json.dumps(result))
  except Exception:
      logger.exception("Failed to persist metrics to redis")

  return result