// sync.js

const { WebSocketMongoSync } = require('resilient-node-cache');

const mongoConfig = {
  uri: 'mongodb://localhost:27017',
  dbName: 'canvasCache',
  collectionName: 'strokes',
};

const resilientDBConfig = {
  baseUrl: 'resilientdb://crow.resilientdb.com',
  httpSecure: true,
  wsSecure: true,
};

const sync = new WebSocketMongoSync(mongoConfig, resilientDBConfig);

sync.on('connected', () => {
  console.log('WebSocket connected.');
});

sync.on('data', (newBlocks) => {
  console.log('Received new blocks:', newBlocks);
});

sync.on('error', (error) => {
  console.error('Error:', error);
});

sync.on('closed', () => {
  console.log('Connection closed.');
});

(async () => {
  try {
    await sync.initialize();
    console.log('Synchronization initialized.');
  } catch (error) {
    console.error('Error during sync initialization:', error);
  }
})();