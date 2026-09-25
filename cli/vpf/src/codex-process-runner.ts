import { createHash } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
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
import { assertNoSecretValues } from "@vpf/runtime-contracts";
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

export interface CodexExecutionActivity {
  runtimePid: number | null;
  elapsedMs: number;
  lastActivityAgeMs: number;
  stdoutBytes: number;
  stderrBytes: number;
  timedOut: boolean;
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
  imagePaths?: string[];
  webSearchMode?: CodexWebSearchMode;
  onActivity?: (activity: CodexExecutionActivity) => void | Promise<void>;
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
  timedOut: boolean;
}

const sha256 = (value: string): string =>
  createHash("sha256").update(value, "utf8").digest("hex");

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/gu, "_").slice(0, 96);
}

function stringifyAsciiSafeJson(value: unknown, space?: number): string {
  const json = JSON.stringify(value, null, space);
  if (json === undefined) {
    throw new TypeError("Codex request input must be JSON-serializable.");
  }
  return json.replace(
    /[\u0080-\uFFFF]/g,
    character =>
      "\\u" + character.charCodeAt(0).toString(16).padStart(4, "0")
  );
}

function truncate(value: string, max = 2000): string {
  return value.length <= max ? value : value.slice(value.length - max);
}

async function copyIfPresent(source: string, target: string): Promise<void> {
  try {
    await copyFile(source, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
}

function collectTraceEvidence(trace: string): {
  webSearchCount: number;
  observedUrls: string[];
} {
  let webSearchCount = 0;
  const urls = new Set<string>();

  const addUrl = (candidate: unknown): void => {
    if (typeof candidate !== "string" || !/^https?:\/\//iu.test(candidate)) return;
    try {
      const url = new URL(candidate);
      url.hash = "";
      urls.add(url.toString());
    } catch {
      // Ignore malformed URLs surfaced in Codex web-search telemetry.
    }
  };

  const collectResultUrls = (input: unknown): void => {
    if (Array.isArray(input)) {
      input.forEach(collectResultUrls);
      return;
    }
    if (typeof input !== "object" || input === null) return;

    const object = input as Record<string, unknown>;

    // Only accept URL-shaped response/result fields as provenance.
    // Do NOT treat query/queries strings as observed source URLs:
    // Codex 0.155.x may echo a URL supplied as the search query while
    // omitting the actual result/open-page URL telemetry.
    for (const key of ["url", "link", "href"]) {
      addUrl(object[key]);
    }

    for (const [key, value] of Object.entries(object)) {
      if (key === "query" || key === "queries") continue;
      collectResultUrls(value);
    }
  };

  for (const line of trace.split(/\r?\n/u)) {
    if (!line.trim()) continue;

    let value: unknown;
    try {
      value = JSON.parse(line) as unknown;
    } catch {
      continue;
    }

    const visit = (input: unknown): void => {
      if (Array.isArray(input)) {
        input.forEach(visit);
        return;
      }
      if (typeof input !== "object" || input === null) return;

      const object = input as Record<string, unknown>;
      const type = typeof object.type === "string" ? object.type : "";

      if (type === "web_search" || type === "web_search_call") {
        webSearchCount += 1;
        collectResultUrls(object);
        return;
      }

      for (const nested of Object.values(object)) visit(nested);
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
  private readonly t010TimeoutMs: number;
  private readonly heartbeatMs: number;
  private cachedPreflight: CodexPreflightResult | null = null;

  constructor(
    private readonly environment: NodeJS.ProcessEnv = process.env
  ) {
    const explicitCommand = (environment.VPF_CODEX_COMMAND ?? "").trim();
    const prefixRaw = (environment.VPF_CODEX_COMMAND_ARGS_JSON ?? "").trim();
    let configuredPrefix: string[] = [];
    if (prefixRaw) {
      try {
        const parsed = JSON.parse(prefixRaw) as unknown;
        if (!Array.isArray(parsed) || parsed.some(item => typeof item !== "string")) {
          throw new Error("must be a JSON string array");
        }
        configuredPrefix = parsed;
      } catch (error) {
        throw new CodexRuntimeError(
          "CODEX_CAPABILITY_MISSING",
          "VPF_CODEX_COMMAND_ARGS_JSON " +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }

    if (explicitCommand) {
      this.command = explicitCommand;
      this.commandPrefixArgs = configuredPrefix;
    } else if (process.platform === "win32") {
      this.command = (environment.ComSpec ?? "cmd.exe").trim();
      this.commandPrefixArgs = ["/d", "/s", "/c", "codex.cmd", ...configuredPrefix];
    } else {
      this.command = "codex";
      this.commandPrefixArgs = configuredPrefix;
    }
    this.timeoutMs = Number(
      environment.VPF_CODEX_TIMEOUT_MS ?? 900000
    );
    this.t010TimeoutMs = Number(
      environment.VPF_CODEX_T010_TIMEOUT_MS ?? 1200000
    );
    this.heartbeatMs = Number(
      environment.VPF_CODEX_HEARTBEAT_MS ?? 15000
    );
    if (
      !this.command ||
      !Number.isFinite(this.timeoutMs) ||
      this.timeoutMs <= 0 ||
      !Number.isFinite(this.t010TimeoutMs) ||
      this.t010TimeoutMs <= 0 ||
      !Number.isFinite(this.heartbeatMs) ||
      this.heartbeatMs <= 0
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
      const loginOk = login.exitCode === 0;
      authStatus = loginOk ? "STORED_LOGIN_OK" : "STORED_LOGIN_FAILED";
      checks.push({
        code: "CODEX_LOGIN_VALID",
        status: loginOk ? "PASS" : "FAIL",
        message: loginOk
          ? "Codex stored login is valid."
          : "Codex stored login is not available."
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
      const requiredExecFlags = [
        "--json",
        "--ephemeral",
        "--skip-git-repo-check",
        "--sandbox",
        "--cd",
        "--config",
        "--output-schema",
        "--output-last-message",
        "--image"
      ];
      const missingExecFlags = requiredExecFlags.filter(flag => !text.includes(flag));
      const execOk = help.exitCode === 0 && missingExecFlags.length === 0;
      checks.push({
        code: "CODEX_EXEC_AVAILABLE",
        status: execOk ? "PASS" : "FAIL",
        message: execOk
          ? "codex exec exposes all VPF-required automation flags."
          : missingExecFlags.length > 0
            ? "codex exec is missing required flags: " + missingExecFlags.join(", ")
            : truncate(text)
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
        (
          request.taskId.startsWith("MANAGER_REVIEW:") ||
          request.taskId.startsWith("MANAGER_SUCCESS:") ||
          request.taskId.startsWith("MANAGER_VISUAL:")
        )
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

    assertNoSecretValues(request.input);
    assertNoSecretValues(request.instructions);

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
    const attachedImages: string[] = [];
    for (const [index, sourcePath] of (request.imagePaths ?? []).entries()) {
      const extension = path.extname(sourcePath).toLowerCase();
      if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
        throw new CodexRuntimeError(
          "CODEX_CAPABILITY_MISSING",
          "Codex visual input must be PNG/JPEG/WEBP: " + sourcePath
        );
      }
      try {
        const target = path.join(
          tempRoot,
          "visual-input-" + String(index + 1).padStart(2, "0") + extension
        );
        await copyFile(sourcePath, target);
        attachedImages.push(target);
      } catch (error) {
        throw new CodexRuntimeError(
          "CODEX_CAPABILITY_MISSING",
          "Codex visual input could not be prepared: " +
            (error instanceof Error ? error.message : String(error))
        );
      }
    }

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
      "- Parse request.json as JSON before using it. It is ASCII-safe JSON, so non-ASCII text is represented by standard JSON \\uXXXX escapes and must be interpreted as Unicode data.",
      "- Return only the structured result required by output.schema.json.",
      "- Do not include secrets, authentication data, or hidden local paths.",
      "",
      ...request.instructions.map(item => "- " + item)
    ].join("\n");

    await writeFile(schemaPath, JSON.stringify(request.outputSchema, null, 2), "utf8");
    await writeFile(requestPath, stringifyAsciiSafeJson(request.input, 2), "utf8");
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
    if (attachedImages.length > 0) {
      args.push("--image", ...attachedImages);
    }
    args.push("--");
    args.push(
      "Read instructions.md and parse request.json as JSON in the current directory. " +
      (attachedImages.length > 0
        ? "Inspect every attached image directly; do not infer image content from filenames or metadata. "
        : "") +
      "Perform only the requested VPF role task. " +
      "Return the final structured JSON matching output.schema.json."
    );

    const auditDirectory = path.join(
      request.projectRoot,
      "logs",
      "codex",
      role.slug,
      safeSegment(request.taskId),
      "attempt_" + String(request.attempt).padStart(2, "0")
    );
    await mkdir(auditDirectory, { recursive: true });

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
      const executionTimeoutMs =
        request.taskId === "T010" ? this.t010TimeoutMs : this.timeoutMs;
      processResult = await this.capture(
        args,
        executionTimeoutMs,
        tempRoot,
        request.onActivity
      );
      trace = processResult.stdout;
      await writeFile(tracePath, trace, "utf8");
      await writeFile(stderrPath, processResult.stderr, "utf8");

      if (processResult.timedOut) {
        throw new CodexRuntimeError(
          "CODEX_EXEC_TIMEOUT",
          "CODEX_TIMEOUT task=" + request.taskId +
          " elapsed_ms=" + executionTimeoutMs +
          " limit_ms=" + executionTimeoutMs + "."
        );
      }

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

      for (const [source, target] of [
        [requestPath, "request.json"],
        [instructionsPath, "instructions.md"],
        [schemaPath, "output.schema.json"],
        [outputPath, "output.json"],
        [tracePath, "trace.jsonl"],
        [stderrPath, "stderr.log"]
      ] as const) {
        await copyIfPresent(source, path.join(auditDirectory, target));
      }
      for (const [index, source] of attachedImages.entries()) {
        await copyIfPresent(
          source,
          path.join(
            auditDirectory,
            "visual-input-" + String(index + 1).padStart(2, "0") + path.extname(source)
          )
        );
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
      try {
        await writeFile(
          path.join(auditDirectory, "runtime-error.txt"),
          (error instanceof Error ? error.name + ": " + error.message : String(error)) + "\n",
          "utf8"
        );
        for (const [source, target] of [
          [requestPath, "request.json"],
          [instructionsPath, "instructions.md"],
          [schemaPath, "output.schema.json"],
          [outputPath, "output.json"],
          [tracePath, "trace.jsonl"],
          [stderrPath, "stderr.log"]
        ] as const) {
          await copyIfPresent(source, path.join(auditDirectory, target));
        }
        for (const [index, source] of attachedImages.entries()) {
          await copyIfPresent(
            source,
            path.join(
              auditDirectory,
              "visual-input-" + String(index + 1).padStart(2, "0") + path.extname(source)
            )
          );
        }
      } catch {
        // Preserve the original runtime error even if audit persistence fails.
      }

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

  private async terminateProcessTree(child: ChildProcess): Promise<void> {
    const pid = child.pid;
    if (pid === undefined) {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
      return;
    }

    if (process.platform === "win32") {
      await new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        try {
          const killer = spawn(
            "taskkill",
            ["/PID", String(pid), "/T", "/F"],
            {
              windowsHide: true,
              shell: false,
              stdio: "ignore"
            }
          );
          killer.once("error", () => {
            try { child.kill("SIGKILL"); } catch { /* already gone */ }
            finish();
          });
          killer.once("close", finish);
        } catch {
          try { child.kill("SIGKILL"); } catch { /* already gone */ }
          finish();
        }
      });
      return;
    }

    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      try { child.kill("SIGTERM"); } catch { /* already gone */ }
    }
    await new Promise(resolve => setTimeout(resolve, 250));
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try { child.kill("SIGKILL"); } catch { /* already gone */ }
    }
  }

  private async capture(
    args: string[],
    timeoutMs: number,
    cwd?: string,
    onActivity?: (activity: CodexExecutionActivity) => void | Promise<void>
  ): Promise<ProcessResult> {
    return await new Promise<ProcessResult>((resolve, reject) => {
      let stdout = "";
      let stderr = "";
      let settled = false;
      let timedOut = false;
      let forceSettleTimer: NodeJS.Timeout | null = null;
      const startedAt = Date.now();
      let lastActivityAt = startedAt;

      const child = spawn(this.command, [...this.commandPrefixArgs, ...args], {
        ...(cwd === undefined ? {} : { cwd }),
        env: this.storedLoginEnvironment(),
        windowsHide: true,
        shell: false,
        stdio: ["ignore", "pipe", "pipe"],
        detached: process.platform !== "win32"
      });

      const reportActivity = (): void => {
        if (onActivity === undefined) return;
        const now = Date.now();
        try {
          const result = onActivity({
            runtimePid: child.pid ?? null,
            elapsedMs: Math.max(0, now - startedAt),
            lastActivityAgeMs: Math.max(0, now - lastActivityAt),
            stdoutBytes: Buffer.byteLength(stdout, "utf8"),
            stderrBytes: Buffer.byteLength(stderr, "utf8"),
            timedOut
          });
          if (result instanceof Promise) void result.catch(() => undefined);
        } catch {
          // Runtime telemetry is observational and must never stop Codex execution.
        }
      };

      const cleanup = (): void => {
        clearTimeout(timer);
        clearInterval(heartbeat);
        if (forceSettleTimer !== null) clearTimeout(forceSettleTimer);
      };

      const finish = (result: ProcessResult): void => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      const heartbeat = setInterval(reportActivity, this.heartbeatMs);
      const timer = setTimeout(() => {
        if (settled) return;
        timedOut = true;
        reportActivity();
        forceSettleTimer = setTimeout(() => {
          finish({
            exitCode: 124,
            stdout,
            stderr,
            timedOut: true
          });
        }, 2000);
        void this.terminateProcessTree(child).catch(() => undefined);
      }, timeoutMs);

      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", chunk => {
        stdout += String(chunk);
        lastActivityAt = Date.now();
      });
      child.stderr?.on("data", chunk => {
        stderr += String(chunk);
        lastActivityAt = Date.now();
      });

      reportActivity();

      child.on("error", error => {
        if (settled) return;
        settled = true;
        cleanup();
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
        finish({
          exitCode: code ?? (timedOut ? 124 : 1),
          stdout,
          stderr,
          timedOut
        });
      });
    });
  }
}


