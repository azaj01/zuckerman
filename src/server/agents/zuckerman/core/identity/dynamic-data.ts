import { join, dirname } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { cwd } from "node:process";
import { platform, arch, hostname, type, release, cpus } from "node:os";
import { version as nodeVersion } from "node:process";

/**
 * Find project root by looking for root markers
 */
function findProjectRoot(): string {
  let dir = cwd();
  while (dir !== dirname(dir)) {
    if (existsSync(join(dir, "pnpm-workspace.yaml")) || existsSync(join(dir, "turbo.json"))) {
      return dir;
    }
    
    const packageJsonPath = join(dir, "package.json");
    if (existsSync(packageJsonPath)) {
      try {
        const content = readFileSync(packageJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        if (pkg.name === "zuckerman") {
          return dir;
        }
      } catch {
        // Continue searching
      }
    }
    dir = dirname(dir);
  }
  
  return cwd();
}

/**
 * Get platform name from platform code
 */
function getPlatformName(): string {
  switch (platform()) {
    case "darwin":
      return "macOS";
    case "win32":
      return "Windows";
    case "linux":
      return "Linux";
    default:
      return platform();
  }
}

/**
 * Build dynamic data section with agent directory, project root paths, and system information
 */
export async function buildDynamicData(agentDir: string): Promise<string> {
  const projectRoot = findProjectRoot();
  const parts: string[] = [];

  parts.push("# Dynamic System Data\n");

  // Agent Directory (Code Location)
  parts.push("## Agent Directory (Code Location)");
  parts.push(`Your agent code is located at: \`${agentDir}\``);
  parts.push(`Project root: \`${projectRoot}\``);
  parts.push("");

  // System Information
  parts.push("## System Information");
  const platformName = getPlatformName();
  parts.push(`- **Operating System**: ${platformName} (${platform()})`);
  parts.push(`- **OS Version**: ${type()} ${release()}`);
  parts.push(`- **Architecture**: ${arch()}`);
  parts.push(`- **Hostname**: ${hostname()}`);
  parts.push(`- **CPU Cores**: ${cpus().length}`);
  parts.push(`- **Node.js Version**: ${nodeVersion}`);

  return parts.join("\n");
}
