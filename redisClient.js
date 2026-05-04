import dotenv from "dotenv";
dotenv.config();
import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL;
const REDIS_PASSWORD = process.env.REDIS_PASS;

export const publisher = new Redis({
  host: REDIS_URL, 
  port: 11665,                   
  password: REDIS_PASSWORD,   
}, { lazyConnect: true });
export const subscriber = new Redis({
  host: REDIS_URL, 
  port: 11665,                    
  password: REDIS_PASSWORD,       
}, { lazyConnect: true });


export async function connectRedis() {
  await publisher.connect();
  await subscriber.connect();
  console.log("[Redis] Publisher + Subscriber connected");
}

export async function disconnectRedis() {
  await publisher.quit();
  await subscriber.quit();
}

