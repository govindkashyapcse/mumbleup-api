const Redis = require("ioredis");

const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASS;

// Separate clients for pub and sub (Redis requirement)
const publisher = new Redis({
  host: REDIS_URL, // e.g., 'localhost' or a cloud URL
  port: 11665,                      // Redis port
  password: REDIS_PASSWORD,       // Optional
}, { lazyConnect: true });
const subscriber = new Redis({
  host: REDIS_URL, // e.g., 'localhost' or a cloud URL
  port: 11665,                      // Redis port
  password: REDIS_PASSWORD,       // Optional
}, { lazyConnect: true });


async function connectRedis() {
  await publisher.connect();
  await subscriber.connect();
  console.log("[Redis] Publisher + Subscriber connected");
}

async function disconnectRedis() {
  await publisher.quit();
  await subscriber.quit();
}

module.exports = { publisher, subscriber, connectRedis, disconnectRedis };
