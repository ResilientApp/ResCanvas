
# About ResCanvas
## The existing problem
Drawing is an important aspect of art and free expression within a variety of domains. It has been used to express new ideas and works of art. Tools such as MS Paint allow for drawing to be achievable on the computer, with online tools extending that functionality over the cloud, allowing users to share and collaborate on drawings and other digital works of art. For instance, both Google's Drawing and Canva's Draw application allow for users to perform drawings and add text on an online, sharable canvas page between registered users. 

However, such online platforms store the drawing and user data in a centralized manner, which allows for their data to be easily trackable by their respective companies, and easily sharable to other third parties such as advertisers. Furthermore, the drawings can be censored by both private and public entities, such as governments and tracking agencies. Privacy is important, yet since online collaboration is an essential part of many user's daily workflow, it is necessary to decentralize the data storage aspect of these online applications. The closest working example of this is Reddit's pixel platform, however, user's data is still stored centrally on their servers and the scope is limited to putting one pixel at a time for each user.

## Overview of ResCanvas
Introducing ResCanvas, a breakthrough in web-based drawing platforms that utilizes ResilientDB to ensure that user's drawings are securely stored while allowing for multiple users to collaborate concurrently creating new works of art and free expression without arbitrary limits, tracking, or censorship by anyone. 

ResCanvas is designed to seamlessly integrate drawings with the familiarity of online contribution between users with effective synchronization of each user's canvas drawing page, allowing for error-free consistency even when multiple users are drawing all at the same time.

The key feature of ResCanvas is that all drawings are stored persistently on ResilientDB in a stroke by stroke manner, in which each stroke is individually cached via in-memory data store using Redis serving as the frontend cache to ensure that the end user is able to receive all the strokes from the other users regardless of the response latency of ResilientDB. This ensures that all users will be able to see each other's strokes under a decentralized context.

## Key Features and Use Cases
* Multiple user concurrent drawing and editing history on a per user basis
* Drawing data and edit history is synchronized efficiently and consistently across all users
* Fast, efficient loading of data from backend by leveraging the caching capabilities of the Redis frontend data storage framework
* Color and thickness selection tools to customize your drawings
* Persistent, secure storage of drawing data in ResilientDB allowing for censorship free expression
* No sharing of data to third parties, advertisers, government entities, .etc with decentralized storage
* Responsive, intuitive UI inspired by Google's Material design theme without the tracking and privacy issues of Google's web applications
* Clear canvas ensures that data is erased for all users on the frontend

## Workflow diagrams
TODO

## Future work
Despite the relatively high robustness and usability of ResCanvas, there are still several potential improvements that we can potentially implement within our application. One of them is operational transformation, which will allow us to efficiently manage concurrent edits by multiple users via the use of transform functions that will define how operations that are performed by one user can then be transformed to account for changes made by other users in a concurrent manner. This will also serve as the foundation for implementing live editing functionality in a way that is similar to that of Google Docs, which allows users to seamlessly observe each other's edits on the canvas in a live, real-time manner. This is particularly useful since the current implementation requires refreshing the canvas in order to see the latest updates from others and that clicking through each user's edit history is required to determine which user performed which drawing.

Another implementation that we will leave for future work is the undo and redo functionality since it requires extensive, intricate tracking of each user's edits to the canvas to ensure that the edits can be undone or reapplied properly even under edits that are performed concurrently between multiple users. We would also need to consider many use cases and edge conditions, such as the situation where one user makes edits to the canvas and another user builds upon the previous user by making additional edits to that same canvas page. In this case, the undo and redo functionality would need to take this into consideration to prevent edit conflicts between users.

## Project Setup
### Step 1
* On the first terminal, navigate to the ResilientDB Key-Value Service directory: `cd ~/resdb/incubator-resilientdb`
* Run the KV-Service shell script: `./service/tools/kv/server_tools/start_kv_service.sh`

### Step 2
* On the second terminal, navigate to the GraphQL directory: `cd ~/resdb/incubator-resilientdb-graphql`
* Start the http server for the crow service endpoints: `bazel-bin/service/http_server/crow_service_main service/tools/config/interface/client.config service/http_server/server_config.config`

### Step 3
* On a third terminal, run the following commands to test the backend:
    * Submit a new request with timestamp `$ts` and data `$value` with the following request: `curl -X POST http://67.181.112.179:10010/submitNewLine \
    -H "Content-Type: application/json" \
    -d '{"ts":"1234", "value":"value1"}'`
    * And to get all the missing data starting from `$from` via the following request: `curl -X GET http://67.181.112.179:10010/getCanvasData \
    -H "Content-Type: application/json" \
    -d '{"from": "2"}'`

### Step 3.5 (optional, only if redis returns errors)
* To optionally clear the data cache from `redis`, run the following commands on another terminal:
    * `redis-cli`
    * `FLUSHALL`
    * `exit`

### Step 4
* Navigate to the backend directory from the Res-Canvas project directory: `cd ./backend`
* Start the backend service for ResCanvas: `python app.py`
    * You may optionally test to see if the backend is working properly by submitting a sample drawing to ResilientDB: `curl -X POST -H "Content-Type: application/json" -d '{"ts": "2024-12-01T00:00:00Z", "value": "{\"drawingId\":\"drawing_123\",\"color\":\"#000000\",\"lineWidth\":5,\"pathData\":[{\"x\":10,\"y\":10},{\"x\":20,\"y\":20}],\"timestamp\":\"2024-12-01T00:00:00Z\"}"}' http://127.0.0.1:10010/submitNewLine
`

### Step 5
* Finally, start the ResCanvas frontend from this project's home directory: `npm start`
    * You should see the browser window open up with the ResCanvas application up and ready to use
* You can stop all the KV Service processes by running: `killall -9 kv_service`