# Vector Search Setup Guide

## Quick Start

### Option 1: Using Docker Compose (Recommended)

```bash
cd backend

# Start Qdrant and Redis
docker-compose up -d qdrant redis

# Verify Qdrant is running
curl http://localhost:6333/healthz
# Should return: {"title":"healthz","version":"1.x.x"}

# Install Python dependencies (if not already done)
pip install -r requirements.txt

# Run backend
python app.py

# Seperate terminal 
python worker/embedding_service.py 
```

### Option 2: Local Qdrant Installation

```bash
# macOS with Homebrew
brew install qdrant

# Or using Docker standalone
docker run -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage \
  qdrant/qdrant

# Install Python dependencies
cd backend
pip install -r requirements.txt

# Run backend
python app.py

# Seperate terminal 
python worker/embedding_service.py 
```

---

## 🔧 Configuration

The following environment variables can be set in `config.py`:

```bash
# Qdrant Vector Database
QDRANT_HOST=localhost
QDRANT_PORT=6333
QDRANT_GRPC_PORT=6334
QDRANT_COLLECTION_NAME=rescanvas_embeddings

# These are already in your config:
# REDIS_HOST=localhost
# REDIS_PORT=6379
# MONGO_ATLAS_URI=...
```
