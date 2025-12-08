import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import supabasePlugin from './plugins/supabase.js';
import userRoutes from './routes/users.js';
import geminiRoutes from './routes/gemini.js';

const server = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register plugins
await server.register(cors, {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
});
await server.register(helmet);

// Register Supabase plugin
await server.register(supabasePlugin);

// Health check endpoint
server.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API routes
server.get('/api/v1', async () => {
  return {
    message: 'AI Concierge API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      users: '/api/v1/users',
      gemini: '/api/v1/gemini',
    },
  };
});

// Register user routes with Supabase integration
await server.register(userRoutes, { prefix: '/api/v1/users' });

// Register Gemini AI routes
await server.register(geminiRoutes, { prefix: '/api/v1/gemini' });

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '8000', 10);
    await server.listen({ port, host: '0.0.0.0' });
    console.log(`🚀 API server running at http://localhost:${port}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
};

start();
