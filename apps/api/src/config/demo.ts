/**
 * Demo mode configuration
 * When DEMO_MODE=true, the app runs without Supabase or VAPI
 */
export const isDemoMode = (): boolean => {
  return process.env.DEMO_MODE === "true";
};
