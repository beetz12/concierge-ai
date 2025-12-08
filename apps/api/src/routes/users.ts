import { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

/**
 * User Routes
 *
 * Example routes demonstrating Supabase integration in Fastify.
 * These routes show how to:
 * - Query data from Supabase
 * - Insert new records
 * - Update existing records
 * - Delete records
 * - Handle errors
 */

// Validation schemas using Zod
const CreateUserSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  name: z.string().min(2).max(100).optional(),
});

const UpdateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(2).max(100).optional(),
});

const UserIdSchema = z.object({
  id: z.string().uuid('Must be a valid UUID'),
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;
type UpdateUserInput = z.infer<typeof UpdateUserSchema>;

const userRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * GET /api/v1/users
   * Retrieve all users (with optional pagination)
   */
  fastify.get(
    '/',
    {
      schema: {
        description: 'Get all users',
        tags: ['users'],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 10 },
            offset: { type: 'number', default: 0 },
          },
        },
        // response schema removed for flexibility with error responses
      },
    },
    async (request, reply) => {
      const { limit = 10, offset = 0 } = request.query as {
        limit?: number;
        offset?: number;
      };

      try {
        const { data, error, count } = await request.supabase
          .from('users')
          .select('*', { count: 'exact' })
          .range(offset, offset + limit - 1)
          .order('created_at', { ascending: false });

        if (error) {
          fastify.log.error({ error }, 'Error fetching users from Supabase');
          return reply.status(500).send({
            success: false,
            error: 'Failed to fetch users',
            message: error.message,
          });
        }

        return reply.send({
          success: true,
          data: data || [],
          count: count || 0,
          pagination: {
            limit,
            offset,
            hasMore: count ? offset + limit < count : false,
          },
        });
      } catch (error) {
        fastify.log.error({ error }, 'Unexpected error fetching users');
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * GET /api/v1/users/:id
   * Retrieve a single user by ID
   */
  fastify.get(
    '/:id',
    {
      schema: {
        description: 'Get user by ID',
        tags: ['users'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const params = UserIdSchema.safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: params.error.flatten(),
        });
      }

      const { id } = params.data;

      try {
        const { data, error } = await request.supabase
          .from('users')
          .select('*')
          .eq('id', id)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return reply.status(404).send({
              success: false,
              error: 'User not found',
            });
          }

          fastify.log.error({ error }, 'Error fetching user from Supabase');
          return reply.status(500).send({
            success: false,
            error: 'Failed to fetch user',
            message: error.message,
          });
        }

        return reply.send({
          success: true,
          data,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Unexpected error fetching user');
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * POST /api/v1/users
   * Create a new user
   */
  fastify.post(
    '/',
    {
      schema: {
        description: 'Create a new user',
        tags: ['users'],
        body: {
          type: 'object',
          required: ['email'],
          properties: {
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const validation = CreateUserSchema.safeParse(request.body);

      if (!validation.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: validation.error.flatten(),
        });
      }

      const userData = validation.data;

      try {
        const { data, error } = await request.supabase
          .from('users')
          .insert([userData as any])
          .select()
          .single();

        if (error) {
          // Handle duplicate email (unique constraint violation)
          if (error.code === '23505') {
            return reply.status(409).send({
              success: false,
              error: 'Email already exists',
            });
          }

          fastify.log.error({ error }, 'Error creating user in Supabase');
          return reply.status(500).send({
            success: false,
            error: 'Failed to create user',
            message: error.message,
          });
        }

        return reply.status(201).send({
          success: true,
          data,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Unexpected error creating user');
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * PATCH /api/v1/users/:id
   * Update an existing user
   */
  fastify.patch(
    '/:id',
    {
      schema: {
        description: 'Update user',
        tags: ['users'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
        body: {
          type: 'object',
          properties: {
            email: { type: 'string', format: 'email' },
            name: { type: 'string' },
          },
        },
      },
    },
    async (request, reply) => {
      const paramsValidation = UserIdSchema.safeParse(request.params);
      const bodyValidation = UpdateUserSchema.safeParse(request.body);

      if (!paramsValidation.success) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid user ID',
          details: paramsValidation.error.flatten(),
        });
      }

      if (!bodyValidation.success) {
        return reply.status(400).send({
          success: false,
          error: 'Validation failed',
          details: bodyValidation.error.flatten(),
        });
      }

      const { id } = paramsValidation.data;
      const updateData = bodyValidation.data;

      if (Object.keys(updateData).length === 0) {
        return reply.status(400).send({
          success: false,
          error: 'No update data provided',
        });
      }

      try {
        const { data, error } = await request.supabase
          .from('users')
          .update({ ...updateData, updated_at: new Date().toISOString() } as any)
          .eq('id', id)
          .select()
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return reply.status(404).send({
              success: false,
              error: 'User not found',
            });
          }

          fastify.log.error({ error }, 'Error updating user in Supabase');
          return reply.status(500).send({
            success: false,
            error: 'Failed to update user',
            message: error.message,
          });
        }

        return reply.send({
          success: true,
          data,
        });
      } catch (error) {
        fastify.log.error({ error }, 'Unexpected error updating user');
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * DELETE /api/v1/users/:id
   * Delete a user
   */
  fastify.delete(
    '/:id',
    {
      schema: {
        description: 'Delete user',
        tags: ['users'],
        params: {
          type: 'object',
          properties: {
            id: { type: 'string' },
          },
          required: ['id'],
        },
      },
    },
    async (request, reply) => {
      const params = UserIdSchema.safeParse(request.params);

      if (!params.success) {
        return reply.status(400).send({
          success: false,
          error: 'Invalid user ID',
          details: params.error.flatten(),
        });
      }

      const { id } = params.data;

      try {
        const { error } = await request.supabase
          .from('users')
          .delete()
          .eq('id', id);

        if (error) {
          fastify.log.error({ error }, 'Error deleting user from Supabase');
          return reply.status(500).send({
            success: false,
            error: 'Failed to delete user',
            message: error.message,
          });
        }

        return reply.status(204).send();
      } catch (error) {
        fastify.log.error({ error }, 'Unexpected error deleting user');
        return reply.status(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );
};

export default userRoutes;
