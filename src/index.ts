// src/index.ts
import 'dotenv/config';
import { startBot } from './bot';
import { startServer } from './api';

async function main() {
  try {
    // Start both services
    await Promise.all([
      startBot(),
      startServer()
    ]);

    console.log('✅ All services started successfully');
  } catch (error) {
    console.error('❌ Error starting services:', error);
    process.exit(1);
  }
}

main();

// Graceful shutdown
process.once('SIGINT', () => {
  console.log('⏸️  Shutting down gracefully...');
  process.exit(0);
});

process.once('SIGTERM', () => {
  console.log('⏸️  Shutting down gracefully...');
  process.exit(0);
});