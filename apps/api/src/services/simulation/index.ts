/**
 * Simulation Services
 *
 * Provides AI-simulated phone calls for demo mode when real
 * VAPI calls are limited by test phone availability.
 */

export {
  SimulatedCallService,
  createSimulatedCallService,
  type SimulatedCallRequest,
} from "./simulated-call.service.js";
