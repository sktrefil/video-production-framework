import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile
} from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { CodexRuntimeRepository } from "@vpf/storage/codex-runtime";
import {
  getCodexRoleProfile,
  type CodexRoleId
} from "./codex-role-profiles.js";

export type CodexWebSearchMode = "live" | "cached" | "disabled";

export interface CodexPreflightCheck {
  code:
    | "CODEX_CLI_INSTALLED"
    | "CODEX_LOGIN_VALID"
    | "CODEX_EXEC_AVAILABLE"
    | "CODEX_OUTPUT_SCHEMA_AVAILABLE"
    | "CODEX_READ_ONLY_SANDBOX_AVAILABLE";
  status: "PASS" | "FAIL";
  message: string;
}

export interface CodexPreflightResult {
  ready: boolean;
  command: string;
  cli_version: string | null;
  auth_status: string | null;
  checks: CodexPreflightCheck[];
}

export interface CodexExecutionRequest<TInput = unknown> {
  projectId: string;
  projectRoot: string;
  dbPath: string;
  roleId: CodexRoleId;
  taskId: string;
  attempt: number;
  instructions: string[];
  input: TInput;
  outputSchema: unknown;
  webSearchMode?: CodexWebSearchMode;
}

export interface CodexExecutionResult<TOutput = unknown> {
  runId: string;
  roleId: CodexRoleId;
  taskId: string;
  provider: "CODEX_SESSION";
  model: string;
  output: TOutput;
  outputSha256: string;
  traceSha256: string;
  webSearchCount: number;
  observedUrls: string[];
  auditDirectory: string;
}

export class CodexRuntimeError extends Error {
  constructor(
    public readonly code:
      | "CODEX_ROLE_TASK_FORBIDDEN"
      | "CODEX_CLI_MISSING"
      | "CODEX_LOGIN_REQUIRED"
      | "CODEX_CAPABILITY_MISSING"
      | "CODEX_EXEC_FAILED"
      | "CODEX_EXEC_TIMEOUT"
      | "CODEX_OUTPUT_MISSING"
      | "CODEX_OUTPUT_INVALID",
    message: string
  ) {
    super(message);
    this.name = "CodexRuntimeError";
  }
}

interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "_").slice(0, 96);
}

function truncate(value: string, max = 2000): string {
  return value.length <= max ? value : value.slice(value.length - max);
}

function collectTraceEvidence(trace: string): {
  webSearchCount: number;
  observedUrls: string[];
} {
  let webSearchCount = 0;
  const urls = new Set<string>();
  for (const line of trace.split(/\r?\n/u)) {
    if (!line.trim()) continue;
    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      continue;
    }
    const visit = (input: unknown, webContext = false): void => {
      if (Array.isArray(input)) {
        input.forEach(item => visit(item, webContext));
        return;
      }
      if (typeof input !== "object" || input === null) return;
      const object = input as Record<string, unknown>;
      const type = typeof object.type === "string" ? object.type : "";
      const nextWebContext =
        webContext || type === "web_search" || type === "web_search_call";
      if (!webContext && nextWebContext) {
        webSearchCount += 1;
      }
      for (const nested of Object.values(object)) {
        if (
          nextWebContext &&
          typeof nested === "string" &&
          /^https?:\/\//iu.test(nested)
        ) {
          try {
            const url = new URL(nested);
            url.hash = "";
            urls.add(url.toString());
          } catch {
            // Ignore malformed URLs surfaced in web-search metadata.
          }
        } else {
          visit(nested, nextWebContext);
        }
      }
    };
    visit(value);
  }
  return {
    webSearchCount,
    observedUrls: [...urls].sort()
  };
}

export class CodexProcessRunner {
  private readonly command: string;
  private readonly commandPrefixArgs: string[];
  private readonly timeoutMs: number;
  private cachedPreflight: CodexPreflightResult | null = null;

  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {
    this.command = (
      environment.VPF_CODEX_COMMAND ??
      (process.platform === "win32" ? "codex.cmd" : "codex")
    ).trim();
    const prefixRaw = (environment.VPF_CODEX_COMMAND_ARGS_JSON ?? "").trim();
    if (prefixRaw) {
      try {
        const parsed = JSON.parse(prefixRaw) as unknown;
        if (!Array.isArray(parsed) || parsed.some(item => typeof item !== "string")) {
          throw new Error("must be a JSON string array");
        }
        this.commandPrefixArgs = parsed;
      } catch (error) {
        throw new CodexRuntimeError(
          "CODEX_CAPABILITY_MISSING",
          "VPF_CODEX_COMMAND_ARGS_JSON " +
            (error instanceof Error ? error.message : String(error))
        );
      }
    } else {
      this.commandPrefixArgs = [];
    }
    this.timeoutMs = Number(
      environment.VPF_CODEX_TIMEOUT_MS ?? 300000
    );
    if (
      !this.command ||
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0
    ) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Invalid Codex command or timeout configuration."
      );
    }
  }

  get modelId(): string {
    return (this.environment.VPF_CODEX_MODEL ?? "").trim() ||
      "codex-default";
  }

  async preflight(): Promise<CodexPreflightResult> {
    const checks: CodexPreflightCheck[] = [];
    let cliVersion: string | null = null;
    let authStatus: string | null = null;

    try {
      const version = await this.capture(["--version"], 15000);
      if (version.exitCode !== 0) throw new Error(version.stderr || version.stdout);
      cliVersion = (version.stdout || version.stderr).trim().split(/\r?\n/u)[0] || null;
      checks.push({
        code: "CODEX_CLI_INSTALLED",
        status: "PASS",
        message: cliVersion ?? "Codex CLI is installed."
      });
    } catch (error) {
      checks.push({
        code: "CODEX_CLI_INSTALLED",
        status: "FAIL",
        message: error instanceof Error ? error.message : String(error)
      });
      return {
        ready: false,
        command: this.command,
        cli_version: null,
        auth_status: null,
        checks
      };
    }

    try {
      const login = await this.capture(["login", "status"], 20000);
      authStatus = truncate((login.stdout || login.stderr).trim(), 500);
      checks.push({
        code: "CODEX_LOGIN_VALID",
        status: login.exitCode === 0 ? "PASS" : "FAIL",
        message: authStatus || "codex login status returned no text."
      });
    } catch (error) {
      checks.push({
        code: "CODEX_LOGIN_VALID",
        status: "FAIL",
        message: error instanceof Error ? error.message : String(error)
      });
    }

    try {
      const help = await this.capture(["exec", "--help"], 15000);
      const text = help.stdout + "\n" + help.stderr;
      const execOk = help.exitCode === 0;
      checks.push({
        code: "CODEX_EXEC_AVAILABLE",
        status: execOk ? "PASS" : "FAIL",
        message: execOk ? "codex exec is available." : truncate(text)
      });
      checks.push({
        code: "CODEX_OUTPUT_SCHEMA_AVAILABLE",
        status: text.includes("--output-schema") ? "PASS" : "FAIL",
        message: text.includes("--output-schema")
          ? "codex exec supports --output-schema."
          : "codex exec --help does not advertise --output-schema."
      });
      checks.push({
        code: "CODEX_READ_ONLY_SANDBOX_AVAILABLE",
        status: text.includes("--sandbox") && text.includes("--cd") ? "PASS" : "FAIL",
        message: text.includes("--sandbox") && text.includes("--cd")
          ? "codex exec supports isolated working directory and sandbox controls."
          : "codex exec --help does not advertise required sandbox/cd controls."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        code: "CODEX_EXEC_AVAILABLE",
        status: "FAIL",
        message
      });
      checks.push({
        code: "CODEX_OUTPUT_SCHEMA_AVAILABLE",
        status: "FAIL",
        message
      });
      checks.push({
        code: "CODEX_READ_ONLY_SANDBOX_AVAILABLE",
        status: "FAIL",
        message
      });
    }

    const result = {
      ready: checks.every(check => check.status === "PASS"),
      command: this.command,
      cli_version: cliVersion,
      auth_status: authStatus,
      checks
    };
    this.cachedPreflight = result;
    return result;
  }

  async execute<TOutput>(
    request: CodexExecutionRequest
  ): Promise<CodexExecutionResult<TOutput>> {
    const role = getCodexRoleProfile(request.roleId);
    const roleTaskAllowed =
      role.allowedTasks.includes(request.taskId) ||
      (
        request.roleId === "CODEX_1_MANAGER" &&
        request.taskId.startsWith("MANAGER_REVIEW:")
      );
    if (!roleTaskAllowed) {
      throw new CodexRuntimeError(
        "CODEX_ROLE_TASK_FORBIDDEN",
        request.roleId + " may not execute task " + request.taskId + "."
      );
    }
    const requestedSearch = request.webSearchMode ??
      (role.webSearchTasks.includes(request.taskId) ? "live" : "disabled");
    if (
      requestedSearch !== "disabled" &&
      !role.webSearchTasks.includes(request.taskId)
    ) {
      throw new CodexRuntimeError(
        "CODEX_ROLE_TASK_FORBIDDEN",
        request.roleId + " may not enable web search for " + request.taskId + "."
      );
    }

    const preflight = this.cachedPreflight ?? await this.preflight();
    const login = preflight.checks.find(check =>
      check.code === "CODEX_LOGIN_VALID"
    );
    if (login?.status !== "PASS") {
      throw new CodexRuntimeError(
        "CODEX_LOGIN_REQUIRED",
        "Codex stored-login preflight failed: " + (login?.message ?? "unknown")
      );
    }
    if (!preflight.ready) {
      throw new CodexRuntimeError(
        "CODEX_CAPABILITY_MISSING",
        "Codex CLI does not satisfy the VPF runtime preflight."
      );
    }

    const runId = [
      request.projectId,
      request.roleId,
      request.taskId,
      "A" + request.attempt
    ].map(safeSegment).join(":");
    const tempRoot = await mkdtemp(
      path.join(tmpdir(), "vpf-codex-runtime-")
    );
    const schemaPath = path.join(tempRoot, "output.schema.json");
    const requestPath = path.join(tempRoot, "request.json");
    const instructionsPath = path.join(tempRoot, "instructions.md");
    const outputPath = path.join(tempRoot, "output.json");
    const tracePath = path.join(tempRoot, "trace.jsonl");
    const stderrPath = path.join(tempRoot, "stderr.log");

    const baseInstructions = [
      "# VPF Codex Role",
      "",
      "Role: " + role.roleId + " — " + role.displayName,
      "Task: " + request.taskId,
      "",
      "Hard boundaries:",
      "- You are an execution worker, not the workflow state owner.",
      "- Do not look for, open, edit, or infer any project.db file.",
      "- Do not change workflow state, revisions, gates, or task status.",
      "- Do not modify repository or project files.",
      "- Work only from request.json and these instructions.",
      "- Return only the structured result required by output.schema.json.",
      "- Do not include secrets, authentication data, or hidden local paths.",
      "",
      ...request.instructions.map(item => "- " + item)
    ].join("\n");

    await writeFile(schemaPath, JSON.stringify(request.outputSchema, null, 2), "utf8");
    await writeFile(requestPath, JSON.stringify(request.input, null, 2), "utf8");
    await writeFile(instructionsPath, baseInstructions, "utf8");

    const args = [
      "exec",
      "--json",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox", "read-only",
      "--cd", tempRoot,
      "--config", 'web_search="' + requestedSearch + '"',
      "--output-schema", schemaPath,
      "--output-last-message", outputPath
    ];
    const model = (this.environment.VPF_CODEX_MODEL ?? "").trim();
    if (model) args.push("--model", model);
    args.push(
      "Read instructions.md and request.json in the current directory. " +
      "Perform only the requested VPF role task. " +
      "Return the final structured JSON matching output.schema.json."
    );

    const repo = new CodexRuntimeRepository(request.dbPath);
    repo.start({
      run_id: runId,
      project_id: request.projectId,
      role_id: request.roleId,
      task_id: request.taskId,
      attempt: request.attempt,
      command_name: this.command,
      cli_version: preflight.cli_version,
      auth_status: preflight.auth_status,
      web_search_mode: requestedSearch,
      input_sha256: sha256(JSON.stringify(request.input)),
      started_at: new Date().toISOString()
    });

    let processResult: ProcessResult | null = null;
    let outputRaw = "";
    let trace = "";
    try {
      processResult = await this.capture(args, this.timeoutMs, tempRoot);
      trace = processResult.stdout;
      await writeFile(tracePath, trace, "utf8");
      await writeFile(stderrPath, processResult.stderr, "utf8");

      if (processResult.exitCode !== 0) {
        throw new CodexRuntimeError(
          "CODEX_EXEC_FAILED",
          "codex exec exited with " + processResult.exitCode +
          ": " + truncate(processResult.stderr || processResult.stdout)
        );
      }

      try {
        outputRaw = await readFile(outputPath, "utf8");
      } catch {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_MISSING",
          "codex exec completed without output-last-message."
        );
      }

      let output: TOutput;
      try {
        output = JSON.parse(outputRaw) as TOutput;
      } catch {
        throw new CodexRuntimeError(
          "CODEX_OUTPUT_INVALID",
          "Codex structured output was not valid JSON."
        );
      }

      const evidence = collectTraceEvidence(trace);
      const outputSha = sha256(outputRaw);
      const traceSha = sha256(trace);
      repo.complete({
        runId,
        outputSha256: outputSha,
        traceSha256: traceSha,
        exitCode: processResult.exitCode,
        stderrExcerpt: truncate(processResult.stderr),
        completedAt: new Date().toISOString()
      });

      const auditDirectory = path.join(
        request.projectRoot,
        "logs",
        "codex",
        role.slug,
        safeSegment(request.taskId),
        "attempt_" + String(request.attempt).padStart(2, "0")
      );
      await mkdir(auditDirectory, { recursive: true });
      for (const [source, target] of [
        [requestPath, "request.json"],
        [instructionsPath, "instructions.md"],
        [schemaPath, "output.schema.json"],
        [outputPath, "output.json"],
        [tracePath, "trace.jsonl"],
        [stderrPath, "stderr.log"]
      ] as const) {
        await copyFile(source, path.join(auditDirectory, target));
      }

      return {
        runId,
        roleId: request.roleId,
        taskId: request.taskId,
        provider: "CODEX_SESSION",
        model: this.modelId,
        output,
        outputSha256: outputSha,
        traceSha256: traceSha,
        webSearchCount: evidence.webSearchCount,
        observedUrls: evidence.observedUrls,
        auditDirectory
      };
    } catch (error) {
      if (error instanceof CodexRuntimeError) {
        repo.fail({
          runId,
          outputSha256: outputRaw ? sha256(outputRaw) : null,
          traceSha256: trace ? sha256(trace) : null,
          exitCode: processResult?.exitCode ?? null,
          stderrExcerpt: truncate(
            processResult?.stderr || error.message
          ),
          completedAt: new Date().toISOString()
        });
        throw error;
      }
      repo.fail({
        runId,
        outputSha256: outputRaw ? sha256(outputRaw) : null,
        traceSha256: trace ? sha256(trace) : null,
        exitCode: processResult?.exitCode ?? null,
        stderrExcerpt: truncate(
          processResult?.stderr ||
          (error instanceof Error ? error.message : String(error))
        ),
        completedAt: new Date().toISOString()
      });
      throw new CodexRuntimeError(
        "CODEX_EXEC_FAILED",
        error instanceof Error ? error.message : String(error)
      );
    } finally {
      repo.close();
      await rm(tempRoot, { recursive: true, force: true });
    }
  }

  private storedLoginEnvironment(): NodeJS.ProcessEnv {
    const env: NodeJS.ProcessEnv = { ...this.environment };
    delete env.OPENAI_API_KEY;
    delete env.OPENAI_API_BASE_URL;
    delete env.CODEX_API_KEY;
    delete env.CODEX_ACCESS_TOKEN;
    delete env.OPENAI_FEDERATION_RULE_ID;
    delete env.OPENAI_IDENTITY_TOKEN_FILE;
    return env;
  }

  private async capture(
    args: string[],
    timeoutMs: number,
    cwd?: string
  ): Promise<ProcessResult> {
    return await new Promise<ProcessResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      const child = spawn(this.command, [...this.commandPrefixArgs, ...args], {
        cwd,
        env: this.storedLoginEnvironment(),
        windowsHide: true,
        shell: false
      });
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, timeoutMs);

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", chunk => { stdout += String(chunk); });
      child.stderr?.on("data", chunk => { stderr += String(chunk); });

      child.on("error", error => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
          reject(new CodexRuntimeError(
            "CODEX_CLI_MISSING",
            "Codex CLI command was not found: " + this.command
          ));
          return;
        }
        reject(error);
      });

      child.on("close", code => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (timedOut) {
          reject(new CodexRuntimeError(
            "CODEX_EXEC_TIMEOUT",
            "Codex process exceeded " + timeoutMs + " ms."
          ));
          return;
        }
        resolve({
          exitCode: code ?? 1,
          stdout,
          stderr
        });
      });
    });
  }
}
