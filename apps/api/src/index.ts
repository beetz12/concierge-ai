import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
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
// CORS_ORIGIN supports multiple origins as comma-separated values
// Example: CORS_ORIGIN="http://localhost:3000,https://app.example.com,https://staging.example.com"
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim())
  : ['http://localhost:3000'];

await server.register(cors, {
  origin: corsOrigins.length === 1 ? corsOrigins[0] : corsOrigins,
});
await server.register(helmet);

// Register Swagger documentation
await server.register(swagger, {
  openapi: {
    openapi: '3.0.0',
    info: {
      title: 'AI Concierge API',
      description: 'API for AI-powered receptionist and appointment scheduling service',
      version: '1.0.0',
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:8000',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    tags: [
      { name: 'health', description: 'Health check endpoints' },
      { name: 'users', description: 'User management endpoints' },
      { name: 'gemini', description: 'AI-powered service provider operations' },
    ],
  },
});

await server.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
  },
});

// Register Supabase plugin
await server.register(supabasePlugin);

// Health check endpoint
server.get('/health', {
  schema: {
    description: 'Health check endpoint',
    tags: ['health'],
    response: {
      200: {
        type: 'object',
        properties: {
          status: { type: 'string' },
          timestamp: { type: 'string' },
        },
      },
    },
  },
}, async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

// API routes
server.get('/api/v1', {
  schema: {
    description: 'API information and available endpoints',
    tags: ['health'],
    response: {
      200: {
        type: 'object',
        properties: {
          message: { type: 'string' },
          version: { type: 'string' },
          endpoints: { type: 'object' },
        },
      },
    },
  },
}, async () => {
  return {
    message: 'AI Concierge API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      users: '/api/v1/users',
      gemini: '/api/v1/gemini',
      docs: '/docs',
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
