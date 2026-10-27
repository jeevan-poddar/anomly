import { MongoClient } from "mongodb";

const globalForMongo = globalThis;

const mongoClientOptions = {
  autoSelectFamily: false, // Avoid racing address families while establishing Atlas sockets.
  maxPoolSize: 5, // Limit connections per serverless instance; instances scale independently.
  minPoolSize: 0, // Do not keep unused connections open in warm serverless instances.
  maxIdleTimeMS: 30_000, // Reclaim connections after short idle periods between requests.
  connectTimeoutMS: 10_000, // Bound each TCP/TLS connection attempt.
  serverSelectionTimeoutMS: 10_000, // Bound time spent waiting for a usable Atlas server.
};

export async function getMongoDatabase() {
  const uri = process.env.MONGODB_URI;
  const databaseName = process.env.MONGODB_DATABASE;
  if (!uri || !databaseName) {
    throw new Error("MONGODB_URI and MONGODB_DATABASE are required.");
  }

  if (!globalForMongo.mongoClientPromise) {
    const client = new MongoClient(uri, mongoClientOptions);
    const clientPromise = client.connect().then(
      () => client,
      (error) => {
        if (globalForMongo.mongoClientPromise === clientPromise) {
          delete globalForMongo.mongoClientPromise;
        }
        console.error("MongoDB connection failed:", {
          name: error instanceof Error ? error.name : "UnknownError",
          message: error instanceof Error ? error.message : String(error),
        });
        throw error;
      },
    );
    globalForMongo.mongoClientPromise = clientPromise;
  }

  const client = await globalForMongo.mongoClientPromise;
  return client.db(databaseName);
}
