// Service Request Types
export interface ServiceRequest {
  id: string;
  userId: string;
  title: string;
  description: string;
  location: string;
  requirements: RequestRequirements;
  status: RequestStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface RequestRequirements {
  rating?: number;
  priceRange?: { min: number; max: number };
  availability?: string;
  urgency?: "low" | "medium" | "high" | "urgent";
}

export type RequestStatus =
  | "pending"
  | "researching"
  | "calling"
  | "completed"
  | "failed"
  | "cancelled";

// Request Step Types
export interface RequestStep {
  id: string;
  requestId: string;
  type: StepType;
  description: string;
  status: StepStatus;
  result?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  completedAt?: Date;
}

export type StepType =
  | "research"
  | "call"
  | "analysis"
  | "scheduling"
  | "notification";

export type StepStatus = "pending" | "in_progress" | "completed" | "failed";

// Agent Task Types
export interface AgentTask {
  id: string;
  requestId: string;
  type: TaskType;
  status: TaskStatus;
  progress: number; // 0-100
  currentAction?: string;
  result?: unknown;
  startedAt?: Date;
  completedAt?: Date;
}

export type TaskType =
  | "search_providers"
  | "call_provider"
  | "analyze_results"
  | "schedule_appointment";

export type TaskStatus = "queued" | "running" | "completed" | "failed";

// Service Provider Types
export interface ServiceProvider {
  id: string;
  name: string;
  phoneNumber: string;
  email?: string;
  category: string;
  location: string;
  rating?: number;
  reviewCount?: number;
  source?: string;
  notes?: string;
  createdAt: Date;
}

// Call Types
export interface Call {
  id: string;
  requestId: string;
  providerId: string;
  status: CallStatus;
  duration?: number;
  transcript?: string;
  outcome?: CallOutcome;
  scheduledAt?: Date;
  startedAt?: Date;
  endedAt?: Date;
}

export type CallStatus =
  | "scheduled"
  | "in_progress"
  | "completed"
  | "failed"
  | "no_answer";

export interface CallOutcome {
  success: boolean;
  available: boolean;
  price?: string;
  availableSlots?: string[];
  notes?: string;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  read: boolean;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

export type NotificationType =
  | "task_completed"
  | "request_updated"
  | "appointment_scheduled"
  | "call_completed"
  | "error";

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
