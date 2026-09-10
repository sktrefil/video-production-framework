import {spawn} from "node:child_process";
import * as path from "node:path";
import {fileURLToPath} from "node:url";
import type {ProviderJobType} from "@vpf/domain";
import {
  RuntimeContractError,
  validateRuntimeJob,
  validateRuntimeResult,
  type RuntimeExecutor,
  type RuntimeJob,
  type RuntimeResult
} from "@vpf/runtime-contracts";
import {
  resolveProjectWorkspace,
  type WorkspaceResolverOptions
} from "@vpf/workspace";

const DEFAULT_REPOSITORY_ROOT = path.resolve(
  fileURLToPath(new URL("../../../", import.meta.url))
);

export interface JsonProcessRuntimeOptions {
  repositoryRoot?: string;
  workspaceOptions?: WorkspaceResolverOptions;
  pythonCommand?: string;
  runtimePath?: string;
  environment?: NodeJS.ProcessEnv;
  timeoutMs?: number;
}

interface RuntimeExecutorRegistryPort {
  register(input: {
    provider: string;
    jobType: ProviderJobType;
    executor: RuntimeExecutor;
  }): void;
}

export class ElevenLabsProcessRuntimeExecutor implements RuntimeExecutor {
  private readonly repositoryRoot: string;
  private readonly runtimePath: string;
  private readonly pythonCommand: string;
  private readonly workspaceOptions: WorkspaceResolverOptions;
  private readonly environment: NodeJS.ProcessEnv;
  private readonly timeoutMs: number;

  constructor(options: JsonProcessRuntimeOptions = {}) {
    this.repositoryRoot = path.resolve(
      options.repositoryRoot ?? DEFAULT_REPOSITORY_ROOT
    );
    this.runtimePath = path.resolve(
      this.repositoryRoot,
      options.runtimePath ?? "runtimes/elevenlabs/runtime.py"
    );
    this.pythonCommand =
      options.pythonCommand ??
      process.env.VPF_PYTHON ??
      (process.platform === "win32" ? "python" : "python3");
    this.workspaceOptions = {
      repositoryRoot: this.repositoryRoot,
      ...(options.workspaceOptions ?? {})
    };
    this.environment = {
      ...process.env,
      ...(options.environment ?? {})
    };
    this.timeoutMs = options.timeoutMs ?? 10 * 60 * 1000;
  }

  async execute(job: RuntimeJob): Promise<RuntimeResult> {
    validateRuntimeJob(job);

    if (
      job.provider !== "ELEVENLABS" ||
      job.jobType !== "TTS_GENERATION" ||
      job.executionMode !== "AUTOMATED"
    ) {
      throw new RuntimeContractError(
        "RUNTIME_CONFIG_INVALID",
        "ElevenLabs process runtime only accepts AUTOMATED ELEVENLABS/TTS_GENERATION jobs."
      );
    }

    for (const requirement of job.secretRequirements) {
      if (
        requirement.required &&
        !(this.environment[requirement.envName] ?? "").trim()
      ) {
        throw new RuntimeContractError(
          "RUNTIME_SECRET_MISSING",
          "Required runtime secret is unavailable: " + requirement.envName
        );
      }
    }

    const workspace = resolveProjectWorkspace(
      job.projectId,
      this.workspaceOptions
    );
    const env: NodeJS.ProcessEnv = {
      ...this.environment,
      VPF_PROJECT_ROOT: workspace.projectRoot
    };

    const result = await runJsonProcess({
      command: this.pythonCommand,
      args: [this.runtimePath],
      stdin: JSON.stringify(job),
      env,
      cwd: this.repositoryRoot,
      timeoutMs: this.timeoutMs
    });

    if (result.exitCode !== 0) {
      const code =
        result.exitCode === 2
          ? "RUNTIME_CONFIG_INVALID"
          : "PROVIDER_REQUEST_FAILED";
      throw new RuntimeContractError(
        code,
        `ElevenLabs runtime process exited with code ${result.exitCode}.`
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(result.stdout);
    } catch {
      throw new RuntimeContractError(
        "PROVIDER_RESULT_INVALID",
        "ElevenLabs runtime stdout was not exactly one RuntimeResult JSON object."
      );
    }

    validateRuntimeResult(job, parsed as RuntimeResult);
    return parsed as RuntimeResult;
  }
}

export function registerElevenLabsRuntimeExecutor(
  registry: RuntimeExecutorRegistryPort,
  options: JsonProcessRuntimeOptions = {}
): ElevenLabsProcessRuntimeExecutor {
  const executor = new ElevenLabsProcessRuntimeExecutor(options);
  registry.register({
    provider: "ELEVENLABS",
    jobType: "TTS_GENERATION",
    executor
  });
  return executor;
}

async function runJsonProcess(input: {
  command: string;
  args: string[];
  stdin: string;
  env: NodeJS.ProcessEnv;
  cwd: string;
  timeoutMs: number;
}): Promise<{exitCode: number; stdout: string}> {
  return await new Promise((resolve, reject) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(input.command, input.args, {
        cwd: input.cwd,
        env: input.env,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true
      });
    } catch (error) {
      reject(
        new RuntimeContractError(
          "RUNTIME_CONFIG_INVALID",
          "Could not start ElevenLabs runtime process: " +
            (error instanceof Error ? error.message : String(error))
        )
      );
      return;
    }

    const stdin = child.stdin;
    const stdoutStream = child.stdout;
    const stderrStream = child.stderr;
    if (stdin === null || stdoutStream === null || stderrStream === null) {
      child.kill("SIGKILL");
      reject(
        new RuntimeContractError(
          "RUNTIME_CONFIG_INVALID",
          "ElevenLabs runtime process did not expose piped stdio streams."
        )
      );
      return;
    }

    stdoutStream.setEncoding("utf8");
    stderrStream.setEncoding("utf8");

    let stdout = "";
    let stderrBytes = 0;
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      reject(
        new RuntimeContractError(
          "PROVIDER_TIMEOUT",
          "ElevenLabs runtime process exceeded the execution timeout."
        )
      );
    }, input.timeoutMs);

    stdoutStream.on("data", (chunk: string) => {
      stdout += chunk;
      if (stdout.length > 2_000_000 && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(
          new RuntimeContractError(
            "PROVIDER_RESULT_INVALID",
            "ElevenLabs runtime stdout exceeded the JSON result size limit."
          )
        );
      }
    });

    stderrStream.on("data", (chunk: string) => {
      stderrBytes += Buffer.byteLength(chunk, "utf8");
      if (stderrBytes > 2_000_000 && !settled) {
        settled = true;
        clearTimeout(timer);
        child.kill("SIGKILL");
        reject(
          new RuntimeContractError(
            "PROVIDER_RESULT_INVALID",
            "ElevenLabs runtime stderr exceeded the process output size limit."
          )
        );
      }
    });

    child.once("error", error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(
        new RuntimeContractError(
          "RUNTIME_CONFIG_INVALID",
          "Could not execute ElevenLabs Python runtime: " + error.message
        )
      );
    });

    child.once("close", code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: code ?? 1,
        stdout: stdout.trim()
      });
    });

    stdin.end(input.stdin, "utf8");
  });
}
