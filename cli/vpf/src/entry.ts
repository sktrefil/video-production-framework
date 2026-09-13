#!/usr/bin/env node
import {EditorAssemblyCliService, EditorAssemblyServiceError} from "./editor-assembly-service.js";
import {EditorOpeningMigrationError} from "./editor-opening-migration.js";
import {EditorOpeningMigrationReconcilerService} from "./editor-opening-duration-reconcile.js";
import {
  EditorProviderMediaMigrationService,
  EditorProviderMigrationError
} from "./editor-provider-media-migration.js";
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
} else if (
  args[0] === "editor" &&
  args[1] === "media" &&
  args[2] === "provider-status"
) {
  const projectId = args[3];
  if (projectId === undefined) {
    console.error("[CLI_USAGE] editor media provider-status requires <project_id>.");
    process.exitCode = 2;
  } else {
    try {
      const result = await new EditorProviderMediaMigrationService().status(projectId);
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.mappingStatus === "READY" ? 0 : 1;
    } catch (error) {
      console.error(`[EDITOR_PROVIDER_STATUS_FAILED] ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
    }
  }
} else if (
  args[0] === "editor" &&
  args[1] === "media" &&
  args[2] === "migrate-opening"
) {
  const projectId = args[3];
  const approvedById = readOption(args, "--approved-by");
  const durationText = readOption(args, "--duration-ms");
  const durationMs = durationText === undefined ? undefined : Number(durationText);
  if (
    projectId === undefined ||
    approvedById === undefined ||
    (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0))
  ) {
    console.error("[CLI_USAGE] editor media migrate-opening requires <project_id> --approved-by <operator> --confirm-reviewed [--duration-ms <positive-ms>].");
    process.exitCode = 2;
  } else {
    try {
      const result = await new EditorOpeningMigrationReconcilerService().migrate({
        projectId,
        approvedById,
        confirmReviewed: args.includes("--confirm-reviewed"),
        ...(durationMs === undefined ? {} : {durationMs})
      });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = result.status === "READY" ? 0 : 1;
    } catch (error) {
      if (error instanceof EditorOpeningMigrationError) {
        console.error(`[${error.code}] ${error.message}`);
      } else {
        console.error(`[EDITOR_OPENING_MIGRATION_FAILED] ${error instanceof Error ? error.message : String(error)}`);
      }
      process.exitCode = 1;
    }
  }
} else if (
  args[0] === "editor" &&
  args[1] === "media" &&
  args[2] === "approve-existing-provider"
) {
  const projectId = args[3];
  const approvedById = readOption(args, "--approved-by");
  if (projectId === undefined || approvedById === undefined) {
    console.error("[CLI_USAGE] editor media approve-existing-provider requires <project_id> --approved-by <operator> --confirm-reviewed.");
    process.exitCode = 2;
  } else {
    try {
      const result = await new EditorProviderMediaMigrationService().approveExistingProviderMedia({
        projectId,
        approvedById,
        confirmReviewed: args.includes("--confirm-reviewed")
      });
      console.log(JSON.stringify(result, null, 2));
      process.exitCode = 0;
    } catch (error) {
      if (error instanceof EditorProviderMigrationError) {
        console.error(`[${error.code}] ${error.message}`);
      } else {
        console.error(`[EDITOR_PROVIDER_MIGRATION_FAILED] ${error instanceof Error ? error.message : String(error)}`);
      }
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
