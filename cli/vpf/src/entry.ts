#!/usr/bin/env node
import {EditorAssemblyCliService, EditorAssemblyServiceError} from "./editor-assembly-service.js";
import {runUnifiedCli} from "./main.js";

function readOption(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  return index < 0 ? undefined : args[index + 1];
}

const args = process.argv.slice(2);

if (args[0] === "editor" && args[1] === "diagnose") {
  const projectId = args[2];
  if (projectId === undefined) {
    console.error("[CLI_USAGE] editor diagnose requires <project_id>.");
    process.exitCode = 2;
  } else {
    try {
      const result = await new EditorAssemblyCliService().diagnose(projectId);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = 0;
    } catch (error) {
      console.error(`[EDITOR_DIAGNOSE_FAILED] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
} else if (args[0] === "editor" && args[1] === "assemble") {
  const projectId = args[2];
  if (projectId === undefined) {
    console.error("[CLI_USAGE] editor assemble requires <project_id>.");
    process.exitCode = 2;
  } else {
    try {
      const result = await new EditorAssemblyCliService().assemble({
        projectId,
        header: readOption(args, "--header") ?? "로마 제9군단의 미스터리"
      });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === "READY" ? 0 : 1;
    } catch (error) {
      if (error instanceof EditorAssemblyServiceError) {
        console.error(`[${error.code}] ${error.message}`);
      } else {
        console.error(`[EDITOR_ASSEMBLE_FAILED] ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exitCode = 1;
    }
  }
} else {
  process.exitCode = await runUnifiedCli(args);
}
