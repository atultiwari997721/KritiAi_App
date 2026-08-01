/**
 * Kriti AI - Terminal Execution Sandbox & Security Gate
 * Phase 2: Sandboxed Command Execution with Path Sanitization & Approval Hooks
 */

import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';
import { EventEmitter } from 'events';

export interface CommandExecutionOptions {
  cwd: string;
  timeoutMs?: number;
  env?: NodeJS.ProcessEnv;
  autoApproveSafeCommands?: boolean;
}

export interface ExecutionResult {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

export type RiskLevel = 'SAFE' | 'MEDIUM' | 'HIGH_RISK' | 'BLOCKED';

export class TerminalSandbox extends EventEmitter {
  private workspaceRoot: string;
  private activeProcesses: Map<string, ChildProcess> = new Map();

  // Explicitly forbidden commands that pose catastrophic system risk
  private static BLOCKED_PATTERNS = [
    /rm\s+-rf\s+[\/\\]/i,
    /del\s+\/f\s+\/s\s+\/q\s+[c-z]:\\/i,
    /format\s+[c-z]:/i,
    /diskpart/i,
    /mkfs/i,
    /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;/i, // Fork bomb
    /shutdown\s+/i,
    />\s*\\\\.\\PhysicalDrive/i
  ];

  // High-risk patterns requiring user approval (via Android mobile or Desktop modal)
  private static HIGH_RISK_PATTERNS = [
    /\bgit\s+push\b/i,
    /\bgit\s+reset\s+--hard\b/i,
    /\bnpm\s+publish\b/i,
    /\bcurl\b.*\|\s*(?:bash|sh|powershell)/i,
    /\bdel\b|\brmdir\b|\brm\b/i,
    /\bnet\s+user\b/i,
    /\breg\s+add\b|\breg\s+delete\b/i
  ];

  constructor(workspaceRoot: string) {
    super();
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  /**
   * Sanitizes and verifies that a directory path is strictly within the allowed workspace
   */
  public sanitizePath(targetPath: string): string {
    const resolved = path.isAbsolute(targetPath)
      ? path.resolve(targetPath)
      : path.resolve(this.workspaceRoot, targetPath);

    // Ensure path traversal (e.g. ../../Windows) is strictly jailed
    const relative = path.relative(this.workspaceRoot, resolved);
    const isContained = !relative.startsWith('..') && !path.isAbsolute(relative);

    if (!isContained && resolved !== this.workspaceRoot) {
      throw new Error(`Security Violation: Path '${targetPath}' escapes workspace root '${this.workspaceRoot}'`);
    }

    return resolved;
  }

  /**
   * Evaluates the risk level of a shell command
   */
  public evaluateRisk(command: string): { risk: RiskLevel; reason?: string } {
    for (const pattern of TerminalSandbox.BLOCKED_PATTERNS) {
      if (pattern.test(command)) {
        return { risk: 'BLOCKED', reason: `Command matches strictly forbidden system destruction rule: ${pattern}` };
      }
    }

    for (const pattern of TerminalSandbox.HIGH_RISK_PATTERNS) {
      if (pattern.test(command)) {
        return { risk: 'HIGH_RISK', reason: `Command requires explicit user confirmation: matches pattern ${pattern}` };
      }
    }

    return { risk: 'SAFE' };
  }

  /**
   * Executes a command inside the sandboxed environment
   */
  public async executeCommand(
    command: string,
    options: CommandExecutionOptions,
    onApprovalRequired?: (command: string, reason: string) => Promise<boolean>
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const workingDir = this.sanitizePath(options.cwd || this.workspaceRoot);

    // 1. Evaluate Risk
    const { risk, reason } = this.evaluateRisk(command);

    if (risk === 'BLOCKED') {
      throw new Error(`Execution Denied: ${reason}`);
    }

    if (risk === 'HIGH_RISK') {
      this.emit('approval_required', { command, reason, cwd: workingDir });
      if (onApprovalRequired) {
        const approved = await onApprovalRequired(command, reason || 'High risk operation');
        if (!approved) {
          throw new Error(`Execution Aborted: User rejected approval for command: ${command}`);
        }
      } else {
        throw new Error(`Execution Paused: High-risk command requires approval ping. Approval handler not attached.`);
      }
    }

    // 2. Determine Shell Platform
    const isWindows = os.platform() === 'win32';
    const shellExecutable = isWindows ? 'powershell.exe' : '/bin/bash';
    const shellArgs = isWindows ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command] : ['-c', command];

    return new Promise((resolve) => {
      let stdout = '';
      let stderr = '';
      let timedOut = false;
      const processId = `proc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      const child = spawn(shellExecutable, shellArgs, {
        cwd: workingDir,
        env: {
          ...process.env,
          ...(options.env || {}),
          PAGER: 'cat',
          CI: 'true'
        }
      });

      this.activeProcesses.set(processId, child);

      // Handle Timeout
      const timeoutMs = options.timeoutMs || 120000; // 2 min default
      const timer = setTimeout(() => {
        timedOut = true;
        this.killProcess(processId);
      }, timeoutMs);

      child.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        this.emit('stdout', { processId, data: str });
      });

      child.stderr.on('data', (data) => {
        const str = data.toString();
        stderr += str;
        this.emit('stderr', { processId, data: str });
      });

      child.on('close', (exitCode) => {
        clearTimeout(timer);
        this.activeProcesses.delete(processId);
        resolve({
          command,
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
          timedOut
        });
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        this.activeProcesses.delete(processId);
        resolve({
          command,
          exitCode: 1,
          stdout,
          stderr: `Process error: ${err.message}`,
          durationMs: Date.now() - startTime,
          timedOut
        });
      });
    });
  }

  /**
   * Terminate an active running process immediately
   */
  public killProcess(processId: string): boolean {
    const child = this.activeProcesses.get(processId);
    if (child) {
      if (os.platform() === 'win32') {
        spawn('taskkill', ['/pid', child.pid!.toString(), '/f', '/t']);
      } else {
        child.kill('SIGKILL');
      }
      this.activeProcesses.delete(processId);
      return true;
    }
    return false;
  }
}
