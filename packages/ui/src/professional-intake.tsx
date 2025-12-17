"use client";

import { useState, useCallback, useId } from "react";

/**
 * Intake question structure
 */
export interface IntakeQuestion {
  id: string;
  question: string;
  type: "text" | "radio" | "select";
  options?: string[];
  placeholder?: string;
}

/**
 * Answer structure for completed questions
 */
export interface IntakeAnswer {
  questionId: string;
  question: string;
  answer: string;
}

/**
 * Props for the ProfessionalIntake component
 */
export interface ProfessionalIntakeProps {
  /** Service type being requested (e.g., "Emergency Plumber") */
  serviceType: string;
  /** Detailed problem description from user */
  problemDescription: string;
  /** Urgency level of the request */
  urgency?: string;
  /** Callback when user completes the intake questions */
  onComplete: (answers: IntakeAnswer[]) => void;
  /** Callback when user skips the intake */
  onSkip: () => void;
  /** Function to fetch questions - allows dependency injection for different backends */
  fetchQuestions?: (data: {
    serviceType: string;
    problemDescription: string;
    urgency?: string;
  }) => Promise<{
    questions: IntakeQuestion[];
    reasoning: string;
    estimatedTime: string;
  }>;
}

type IntakeState = "collapsed" | "loading" | "expanded" | "completed" | "error";

/**
 * Lightbulb icon for the collapsed state
 */
function LightbulbIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
      <path d="M9 18h6" />
      <path d="M10 22h4" />
    </svg>
  );
}

/**
 * Check circle icon for answered questions
 */
function CheckCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

/**
 * Loader/spinner icon for loading state
 */
function LoaderIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={`animate-spin ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}

/**
 * Sparkles icon for completed state
 */
function SparklesIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
      <path d="M5 3v4" />
      <path d="M19 17v4" />
      <path d="M3 5h4" />
      <path d="M17 19h4" />
    </svg>
  );
}

/**
 * Alert circle icon for error state
 */
function AlertCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

/**
 * ProfessionalIntake - AI-powered intake questions for better service matching
 *
 * This component generates context-aware professional questions based on
 * the service type and problem description. It helps gather relevant
 * information that improves the AI's ability to communicate with providers.
 */
export function ProfessionalIntake({
  serviceType,
  problemDescription,
  urgency,
  onComplete,
  onSkip,
  fetchQuestions,
}: ProfessionalIntakeProps) {
  const componentId = useId();
  const [state, setState] = useState<IntakeState>("collapsed");
  const [questions, setQuestions] = useState<IntakeQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [estimatedTime, setEstimatedTime] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Count answered questions
  const answeredCount = Object.values(answers).filter(
    (a) => a && a.trim() !== ""
  ).length;

  const handleGetQuestions = useCallback(async () => {
    if (!fetchQuestions) {
      console.error("No fetchQuestions function provided to ProfessionalIntake");
      setError("Unable to generate questions. Please continue without them.");
      setState("error");
      return;
    }

    setState("loading");
    setError(null);

    try {
      const result = await fetchQuestions({
        serviceType,
        problemDescription,
        urgency,
      });

      setQuestions(result.questions);
      setEstimatedTime(result.estimatedTime);
      setState("expanded");
    } catch (err) {
      console.error("Failed to generate intake questions:", err);
      setError("Unable to generate questions. Please continue without them.");
      setState("error");
    }
  }, [fetchQuestions, serviceType, problemDescription, urgency]);

  const handleAnswerChange = useCallback(
    (questionId: string, value: string) => {
      setAnswers((prev) => ({
        ...prev,
        [questionId]: value,
      }));
    },
    []
  );

  const handleSaveAnswers = useCallback(() => {
    // Convert answers to array format
    const answerArray: IntakeAnswer[] = questions
      .filter((q) => {
        const answer = answers[q.id];
        return answer !== undefined && answer.trim() !== "";
      })
      .map((q) => ({
        questionId: q.id,
        question: q.question,
        answer: answers[q.id] as string, // Safe after filter
      }));

    setState("completed");
    onComplete(answerArray);
  }, [answers, questions, onComplete]);

  const handleSkipAll = useCallback(() => {
    setState("completed");
    onSkip();
  }, [onSkip]);

  // Collapsed State - Initial prompt to get questions
  if (state === "collapsed") {
    return (
      <div className="bg-gradient-to-r from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <LightbulbIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-100 mb-1">
              Want better results?
            </h3>
            <p className="text-sm text-slate-400 mb-4">
              Let me ask a few professional questions to help explain your
              situation more accurately to providers.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGetQuestions}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
              >
                Get Smart Questions
              </button>
              <button
                type="button"
                onClick={handleSkipAll}
                className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
              >
                Skip
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Loading State
  if (state === "loading") {
    return (
      <div className="bg-gradient-to-r from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
            <LoaderIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-100 mb-1">
              Generating questions...
            </h3>
            <p className="text-sm text-slate-400">
              Analyzing your request to create relevant questions.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Error State
  if (state === "error") {
    return (
      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-5">
        <div className="flex items-start gap-4">
          <div className="shrink-0 w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
            <AlertCircleIcon className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-red-300 mb-1">
              Unable to generate questions
            </h3>
            <p className="text-sm text-red-400/80 mb-4">
              {error || "Something went wrong. You can continue without additional questions."}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={handleGetQuestions}
                className="px-4 py-2 bg-red-600/50 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
              >
                Try Again
              </button>
              <button
                type="button"
                onClick={handleSkipAll}
                className="px-4 py-2 text-red-300 hover:text-red-200 text-sm font-medium transition-colors"
              >
                Continue Without Questions
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Completed State
  if (state === "completed") {
    return (
      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="shrink-0 w-10 h-10 bg-emerald-500/20 rounded-lg flex items-center justify-center">
            <SparklesIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-emerald-300 mb-1">
              {answeredCount > 0
                ? `${answeredCount} answer${answeredCount > 1 ? "s" : ""} saved`
                : "Intake skipped"}
            </h3>
            <p className="text-sm text-emerald-400/80">
              {answeredCount > 0
                ? "Your answers will help our AI communicate more effectively with providers."
                : "Continuing with the basic information you provided."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Expanded State - Showing questions
  return (
    <div className="bg-surface border border-surface-highlight rounded-xl overflow-hidden">
      {/* Header */}
      <div className="bg-indigo-500/10 border-b border-indigo-500/20 px-5 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="shrink-0 w-8 h-8 bg-indigo-500/20 rounded-lg flex items-center justify-center">
              <LightbulbIcon className="w-4 h-4 text-indigo-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-100">
                Professional Questions
              </h3>
              <p className="text-xs text-slate-400">
                {answeredCount}/{questions.length} answered
                {estimatedTime && ` - ${estimatedTime}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Questions List */}
      <div className="p-5 space-y-5">
        {questions.map((question, index) => {
          const inputId = `${componentId}-question-${question.id}`;
          const answerValue = answers[question.id];
          const isAnswered =
            answerValue !== undefined && answerValue.trim() !== "";

          return (
            <div
              key={question.id}
              className="relative pl-8 border-l-2 border-slate-700/50"
            >
              {/* Question number badge */}
              <div
                className={`absolute -left-3 top-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                  isAnswered
                    ? "bg-emerald-500/20 text-emerald-400"
                    : "bg-slate-700 text-slate-400"
                }`}
              >
                {isAnswered ? (
                  <CheckCircleIcon className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>

              <div className="space-y-2">
                <label
                  htmlFor={inputId}
                  className="block text-sm font-medium text-slate-200"
                >
                  {question.question}
                </label>

                {/* Text Input */}
                {question.type === "text" && (
                  <input
                    id={inputId}
                    type="text"
                    placeholder={question.placeholder || "Type your answer..."}
                    value={answers[question.id] || ""}
                    onChange={(e) =>
                      handleAnswerChange(question.id, e.target.value)
                    }
                    className="w-full h-10 px-3 py-2 bg-abyss border border-surface-highlight rounded-lg text-sm text-slate-100 placeholder:text-slate-500 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30"
                  />
                )}

                {/* Radio Buttons */}
                {question.type === "radio" && question.options && (
                  <div className="flex flex-wrap gap-2">
                    {question.options.map((option) => {
                      const optionId = `${inputId}-${option}`;
                      const isSelected = answers[question.id] === option;

                      return (
                        <label
                          key={option}
                          htmlFor={optionId}
                          className={`relative flex items-center px-4 py-2 rounded-lg cursor-pointer select-none transition-all text-sm ${
                            isSelected
                              ? "bg-indigo-600 text-white"
                              : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/50"
                          }`}
                        >
                          <input
                            type="radio"
                            id={optionId}
                            name={inputId}
                            value={option}
                            checked={isSelected}
                            onChange={() =>
                              handleAnswerChange(question.id, option)
                            }
                            className="sr-only"
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Select Dropdown */}
                {question.type === "select" && question.options && (
                  <select
                    id={inputId}
                    value={answers[question.id] || ""}
                    onChange={(e) =>
                      handleAnswerChange(question.id, e.target.value)
                    }
                    className="w-full h-10 px-3 py-2 bg-abyss border border-surface-highlight rounded-lg text-sm text-slate-100 outline-none transition-all focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/30 appearance-none cursor-pointer"
                    style={{
                      backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                      backgroundPosition: "right 0.5rem center",
                      backgroundRepeat: "no-repeat",
                      backgroundSize: "1.5em 1.5em",
                      paddingRight: "2.5rem",
                    }}
                  >
                    <option value="" disabled>
                      {question.placeholder || "Select an option..."}
                    </option>
                    {question.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="bg-slate-800/30 border-t border-surface-highlight px-5 py-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <p className="text-xs text-slate-500">
            These help our AI explain your situation accurately to providers
          </p>
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleSkipAll}
              className="px-4 py-2 text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
            >
              Skip All
            </button>
            <button
              type="button"
              onClick={handleSaveAnswers}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors shadow-lg shadow-indigo-500/20"
            >
              Save Answers
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
