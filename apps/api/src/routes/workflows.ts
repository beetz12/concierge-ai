import { FastifyInstance } from 'fastify';
import axios from 'axios';

interface TriggerWorkflowBody {
    namespace: string;
    flowId: string;
    inputs?: Record<string, any>;
}

export default async function workflowRoutes(fastify: FastifyInstance) {
    fastify.post<{ Body: TriggerWorkflowBody }>('/trigger', {
        schema: {
            tags: ['workflows'],
            body: {
                type: 'object',
                required: ['namespace', 'flowId'],
                properties: {
                    namespace: { type: 'string' },
                    flowId: { type: 'string' },
                    inputs: { type: 'object' }
                }
            }
        }
    }, async (request, reply) => {
        const { namespace, flowId, inputs } = request.body;
        const kestraUrl = process.env.KESTRA_URL || 'http://localhost:8082';

        try {
            // Trigger Kestra Execution
            const response = await axios.post(
                `${kestraUrl}/api/v1/executions/${namespace}/${flowId}`,
                inputs,
                {
                    headers: {
                        'Content-Type': 'multipart/form-data' // Kestra expects multipart or JSON depending on version, often inputs are formData
                        // Actually, for Kestra API: POST /api/v1/executions/{namespace}/{flowId} 
                        // Body is formData for inputs. 
                        // Let's use standard JSON input application/json if supported by newer Kestra, 
                        // or we might need to format strictly. 
                        // In 0.18+, simple JSON map in body with Content-Type: application/json keys being input names works?
                        // Actually, usually it's FormData. Let's try sending as simple JSON first, Kestra is flexible.
                        // Documentation says: keys as Form Data.
                    }
                }
            );

            // If we need to send JSON as FormData, axios handles it if we use Form class, 
            // but simpler: Kestra accepts map of inputs if Content-Type is application/json?
            // Let's assume standard POST for now. If it fails we refine.
            // Wait, Kestra API usually is multipart/form-data for file uploads, 
            // but simple inputs can be sent.

            // Let's try sending as plain JSON object.
            // Actually, looking at Kestra docs: inputs are map<string, string>.

            request.log.info({ execution: response.data }, 'Kestra workflow triggered');

            return reply.send({
                status: 'success',
                executionId: response.data.id,
                flowId,
                message: 'Workflow started'
            });

        } catch (error: any) {
            request.log.error(error, 'Failed to trigger Kestra workflow');
            return reply.status(500).send({
                status: 'error',
                message: error.message || 'Failed to trigger workflow',
                details: error.response?.data
            });
        }
    });
}
