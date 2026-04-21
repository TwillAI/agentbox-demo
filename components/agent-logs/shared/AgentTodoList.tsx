import React, { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Progress } from "@/components/ui/progress";
import {
  ListTodo as ListDashes,
  CheckCircle2 as CheckCircle,
  Circle,
  XCircle,
  Clock,
  ChevronDown as CaretDown,
  ChevronRight as CaretRight,
} from "lucide-react";
import type { AgentTodo } from "../types";

interface AgentTodoListProps {
  todos: AgentTodo[];
}

export const AgentTodoList: React.FC<AgentTodoListProps> = ({ todos }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const getModifiedTodo = () => {
    const inProgress = todos.find((t) => t.status === "in_progress");
    if (inProgress) return inProgress;

    const completed = [...todos]
      .reverse()
      .find((t) => t.status === "completed");
    if (completed) return completed;

    return todos.find((t) => t.status === "pending");
  };

  const modifiedTodo = getModifiedTodo();

  const getStatusIcon = (status: AgentTodo["status"]) => {
    switch (status) {
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "in_progress":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "cancelled":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "pending":
      default:
        return <Circle className="text-muted-foreground h-4 w-4" />;
    }
  };

  const getStatusColor = (status: AgentTodo["status"]) => {
    switch (status) {
      case "completed":
        return "text-green-600 dark:text-green-400";
      case "in_progress":
        return "text-yellow-600 dark:text-yellow-400 font-medium";
      case "cancelled":
        return "text-red-600 dark:text-red-400 line-through opacity-60";
      case "pending":
      default:
        return "text-muted-foreground";
    }
  };

  const getStatusLabel = (status: AgentTodo["status"]) => {
    switch (status) {
      case "completed":
        return "Completed";
      case "in_progress":
        return "In Progress";
      case "cancelled":
        return "Cancelled";
      case "pending":
      default:
        return "Pending";
    }
  };

  const getStatusBadgeClass = (status: AgentTodo["status"]) => {
    switch (status) {
      case "completed":
        return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
      case "in_progress":
        return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
      case "cancelled":
        return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
      case "pending":
      default:
        return "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300";
    }
  };

  const completedCount = todos.filter((t) => t.status === "completed").length;
  const progressPercentage =
    todos.length > 0 ? (completedCount / todos.length) * 100 : 0;

  return (
    <div className="border-border rounded-md border bg-gradient-to-br from-gray-50 to-gray-100/50 p-2.5 dark:from-gray-900/50 dark:to-gray-900/30">
      <div
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {isExpanded ? (
              <CaretDown className="text-muted-foreground h-3.5 w-3.5" />
            ) : (
              <CaretRight className="text-muted-foreground h-3.5 w-3.5" />
            )}
            <ListDashes className="text-muted-foreground h-4 w-4" />
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
              <span className="text-muted-foreground text-xs font-medium">
                {completedCount} of {todos.length}
              </span>
            </span>
          </div>
          <div className="flex items-center gap-2" />
        </div>
      </div>

      <Progress value={progressPercentage} className="bg-muted mt-2 h-1.5" />

      {!isExpanded && modifiedTodo && (
        <div className="mt-2">
          <div className="group flex items-center gap-2 rounded-sm px-0.5 py-0.5">
            <div className="relative flex flex-col items-center">
              <div className="bg-background z-10 rounded-full">
                {getStatusIcon(modifiedTodo.status)}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <span
                className={`text-xs leading-snug ${getStatusColor(modifiedTodo.status)} block truncate`}
              >
                {modifiedTodo.content}
              </span>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-2.5 space-y-1">
              {todos.map((todo, index) => (
                <div
                  key={todo.id ?? index}
                  className="hover:bg-muted/50 group flex items-start gap-2 rounded-sm px-0.5 py-1 transition-colors"
                >
                  <div className="relative flex flex-col items-center">
                    <div className="bg-background z-10 mt-0.5 rounded-full">
                      {getStatusIcon(todo.status)}
                    </div>
                    {index < todos.length - 1 && (
                      <div className="from-border absolute top-4 h-full w-px bg-gradient-to-b to-transparent" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs leading-snug ${getStatusColor(todo.status)} break-words`}
                      >
                        {todo.content}
                      </span>
                      <span
                        className={`flex-shrink-0 rounded-full px-1.5 py-0.5 text-xs whitespace-nowrap ${getStatusBadgeClass(todo.status)}`}
                      >
                        {getStatusLabel(todo.status)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const TodoDisplay = AgentTodoList;
