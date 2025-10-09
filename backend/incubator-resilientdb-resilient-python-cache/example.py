"""Example: ResilientPythonCache usage with MongoDB and ResilientDB.

Set MONGO_URL, MONGO_DB, and MONGO_COLLECTION in a .env file, then run
python example.py. This script connects to MongoDB and ResilientDB and
prints incoming blocks. It's an example only — add proper error handling,
retries, and security for production use.
"""

import asyncio
import os
from dotenv import load_dotenv
from resilient_python_cache import ResilientPythonCache, MongoConfig, ResilientDBConfig

load_dotenv()

async def main():
    """
    Main function that sets up and runs the ResilientPythonCache.
    
    This function:
    1. Loads MongoDB configuration from environment variables
    2. Creates ResilientDB configuration
    3. Initializes the cache with both configurations
    4. Sets up event handlers for various cache events
    5. Runs the cache indefinitely until interrupted
    """
    mongo_config = MongoConfig(
        uri=os.environ["MONGO_URL"],
        db_name=os.environ["MONGO_DB"],
        collection_name=os.environ["MONGO_COLLECTION"]
    )
        
    resilient_db_config = ResilientDBConfig(
        base_url="resilientdb://crow.resilientdb.com",
        http_secure=True,
        ws_secure=True
    )

    # Initialize cache with configurations
    cache = ResilientPythonCache(mongo_config, resilient_db_config)

    # Set up event handlers
    cache.on("connected", lambda: print("WebSocket connected."))
    cache.on("data", lambda new_blocks: print("Received new blocks:", new_blocks))
    cache.on("error", lambda error: print("Error:", error))
    cache.on("closed", lambda: print("Connection closed."))

    try:
        # Initialize the cache and start synchronization
        await cache.initialize()
        print("Synchronization initialized.")

        try:
            # Keep the script running indefinitely
            await asyncio.Future()  # Run indefinitely
        except asyncio.CancelledError:
            pass

    except Exception as error:
        print("Error during sync initialization:", error)
    finally:
        # Ensure proper cleanup on exit
        await cache.close()

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Interrupted by user")