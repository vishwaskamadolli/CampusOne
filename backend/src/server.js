import mongoose from 'mongoose';
import { app } from './app.js';
import { config } from './config.js';

async function start() {
  await mongoose.connect(config.mongoUri);
  app.listen(config.port, () => console.log(`CampusOne API running at http://localhost:${config.port}`));
}

start().catch((error) => {
  console.error('Unable to start API', error);
  process.exitCode = 1;
});
