import {
  Wrench,
  Search as SearchIcon,
  Terminal,
  Eye,
  Pencil,
  ListTodo,
  FilePlus,
  Bot,
  ArrowRight,
  ArrowLeft,
} from "lucide-react";
import type { AgentToolInput, AgentTodo, AgentToolIconMap } from "../types";

export const defaultToolIconMap: AgentToolIconMap = {
  Grep: SearchIcon,
  Glob: SearchIcon,
  Read: Eye,
  LS: Eye,
  Write: FilePlus,
  WriteFile: FilePlus,
  Bash: Terminal,
  MultiEdit: Pencil,
  Edit: Pencil,
  Search: SearchIcon,
  SearchReplace: Pencil,
  TodoWrite: ListTodo,
  Task: Bot,
  Agent: Bot,
  TaskInput: ArrowRight,
  TaskOutput: ArrowLeft,
  default: Wrench,
};

export const getLanguageFromPath = (filePath?: string): string | undefined => {
  if (!filePath) return undefined;

  const extension = filePath.split(".").pop()?.toLowerCase();

  switch (extension) {
    case "js":
    case "jsx":
      return "javascript";
    case "ts":
    case "tsx":
      return "typescript";
    case "py":
      return "python";
    case "css":
      return "css";
    case "html":
      return "html";
    case "json":
      return "json";
    case "yaml":
    case "yml":
      return "yaml";
    case "md":
    case "markdown":
      return "markdown";
    case "sql":
      return "sql";
    case "sh":
    case "bash":
      return "shell";
    case "go":
      return "go";
    case "rs":
      return "rust";
    case "java":
      return "java";
    case "c":
    case "cpp":
    case "cc":
    case "cxx":
      return "cpp";
    case "cs":
      return "csharp";
    case "php":
      return "php";
    case "rb":
      return "ruby";
    case "swift":
      return "swift";
    case "kt":
      return "kotlin";
    case "r":
      return "r";
    case "vue":
      return "vue";
    case "svelte":
      return "svelte";
    default:
      return undefined;
  }
};

export const formatToolDescription = (
  name: string,
  input: AgentToolInput,
): string => {
  switch (name) {
    case "Glob": {
      if (input?.pattern) {
        const pattern = String(input.pattern);
        if (pattern.includes("*.")) {
          const ext = pattern
            .split("*.")
            .pop()
            ?.split(/[\s\}]/)[0];
          return `Searching for ${ext} files`;
        }
        if (pattern.includes("**/")) {
          const dir = pattern.replace("**/", "").replace("/**", "");
          return `Searching in ${dir || "all directories"}`;
        }
        return `Searching for ${pattern}`;
      }
      return "Searching files";
    }
    case "Read": {
      const readFilePath =
        (input?.path as string) ||
        (input?.target_file as string) ||
        (input?.file_path as string);
      if (readFilePath) {
        const filename = readFilePath.split("/").pop() || readFilePath;
        return `Reading ${filename}`;
      }
      return "Reading file";
    }
    case "LS": {
      const lsPath =
        (input?.path as string) ||
        (input?.target_directory as string) ||
        (input?.directory as string);
      if (lsPath) {
        const dirname = lsPath.split("/").pop() || lsPath;
        return `Listing ${dirname}`;
      }
      return "Listing directory";
    }
    case "Write":
    case "WriteFile": {
      const writeFilePath =
        (input?.path as string) ||
        (input?.file_path as string) ||
        (input?.target_file as string);
      if (writeFilePath) {
        const filename = writeFilePath.split("/").pop() || writeFilePath;
        return `Writing ${filename}`;
      }
      return "Writing file";
    }
    case "Grep": {
      if (input?.query || input?.pattern) {
        const term = String(input.query || input.pattern || "");
        return `Searching for "${term}${term.length > 30 ? "..." : ""}"`;
      }
      return "Searching";
    }
    case "Edit":
    case "SearchReplace": {
      const editFilePath =
        (input?.file_path as string) ||
        (input?.path as string) ||
        (input?.target_file as string);
      if (editFilePath) {
        const filename = editFilePath.split("/").pop() || editFilePath;
        return `Editing ${filename}`;
      }
      return "Editing file";
    }
    case "MultiEdit": {
      const multiEditFilePath =
        (input?.file_path as string) ||
        (input?.path as string) ||
        (input?.target_file as string);
      if (multiEditFilePath) {
        const filename =
          multiEditFilePath.split("/").pop() || multiEditFilePath;
        return `Editing ${filename}`;
      }
      return "Editing file";
    }
    case "Bash": {
      if (input?.command) {
        const cmd = String(input.command);
        return `Running: ${cmd}`;
      }
      return "Running command";
    }
    case "Search": {
      if (input?.query) {
        const query = String(input.query);
        return `Searching: "${query.length > 30 ? `${query.slice(0, 30)}...` : query}"`;
      }
      return "Searching";
    }
    case "TodoWrite": {
      if (Array.isArray(input?.todos)) {
        const todos = input.todos as AgentTodo[];
        const total = todos.length;
        const completed = todos.filter(
          (todo) => todo.status === "completed",
        ).length;
        if (total > 0) {
          return `Updating todos: ${completed}/${total} completed`;
        }
      }
      return "Managing todos";
    }
    case "Task": {
      if (input?.description && input?.subagent_type) {
        return `${input.description} (${input.subagent_type})`;
      }
      if (input?.description) {
        return String(input.description);
      }
      return "Dispatching task to sub-agent";
    }
    case "TaskInput":
      return input?.description ? `Input: ${input.description}` : "Task Input";
    case "TaskOutput":
      return "Task Output";
    default: {
      if (input && typeof input === "object") {
        const keys = Object.keys(input);
        if (keys.length > 0) {
          return name;
        }
      }
      return name;
    }
  }
};
