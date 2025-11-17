"""
Example implementation of ResilientPythonCache.

This example demonstrates how to set up and use the ResilientPythonCache with MongoDB
and ResilientDB. It creates a cache instance that listens for new blocks and maintains
synchronization with ResilientDB.

Prerequisites:
1. MongoDB instance running and accessible
2. Environment variables set up in a .env file:
   ```
   MONGO_URL=mongodb://localhost:27017
   MONGO_DB=your_database_name
   MONGO_COLLECTION=your_collection_name
   ```

Usage:
1. Create a .env file with the required MongoDB configuration
2. Run: python example.py
3. The script will:
   - Connect to MongoDB using the provided configuration
   - Connect to ResilientDB at crow.resilientdb.com
   - Listen for new blocks and print them to console
   - Run indefinitely until interrupted (Ctrl+C)

Event Handlers:
- connected: Triggered when WebSocket connection is established
- data: Triggered when new blocks are received
- error: Triggered when an error occurs
- closed: Triggered when the connection is closed

Note: This is an example implementation. In production, you should:
- Add proper error handling and logging
- Implement retry mechanisms
- Add proper security measures
- Consider using a connection pool for MongoDB
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
        base_url="resilientdb://dev-crow.resilientdb.com",
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