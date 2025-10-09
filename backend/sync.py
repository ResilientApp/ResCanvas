# sync.py

import asyncio
from resilient_python_cache import ResilientPythonCache, MongoConfig, ResilientDBConfig
from config import MONGO_URI, DB_NAME, COLLECTION_NAME, RES_DB_BASE_URL

async def main():
    mongo_config = MongoConfig(
        uri=MONGO_URI,
        db_name=DB_NAME,
        collection_name=COLLECTION_NAME
    )

    resilient_db_config = ResilientDBConfig(
        base_url=RES_DB_BASE_URL,
        http_secure=False,
        ws_secure=False
    )

    cache = ResilientPythonCache(mongo_config, resilient_db_config)

    cache.on("connected", lambda: print("WebSocket connected."))
    cache.on("data", lambda new_blocks: print("Received new blocks:", new_blocks))
    cache.on("error", lambda error: print("Error:", error))
    cache.on("closed", lambda: print("Connection closed."))

    try:
        await cache.initialize()
        print("Synchronization initialized.")

        try:
            await asyncio.Future()  # Run indefinitely
        except asyncio.CancelledError:
            pass

    except Exception as error:
        print("Error during sync initialization:", error)
    finally:
        try:
            await cache.close()
        except Exception:
            pass

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("Interrupted by user")