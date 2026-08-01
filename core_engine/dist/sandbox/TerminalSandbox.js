"use strict";
/**
 * Kriti AI - Terminal Execution Sandbox & Security Gate
 * Phase 2: Sandboxed Command Execution with Path Sanitization & Approval Hooks
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.TerminalSandbox = void 0;
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const events_1 = require("events");
class TerminalSandbox extends events_1.EventEmitter {
    workspaceRoot;
    activeProcesses = new Map();
    // Explicitly forbidden commands that pose catastrophic system risk
    static BLOCKED_PATTERNS = [
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
    static HIGH_RISK_PATTERNS = [
        /\bgit\s+push\b/i,
        /\bgit\s+reset\s+--hard\b/i,
        /\bnpm\s+publish\b/i,
        /\bcurl\b.*\|\s*(?:bash|sh|powershell)/i,
        /\bdel\b|\brmdir\b|\brm\b/i,
        /\bnet\s+user\b/i,
        /\breg\s+add\b|\breg\s+delete\b/i
    ];
    constructor(workspaceRoot) {
        super();
        this.workspaceRoot = path.resolve(workspaceRoot);
    }
    /**
     * Sanitizes and verifies that a directory path is strictly within the allowed workspace
     */
    sanitizePath(targetPath) {
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
    evaluateRisk(command) {
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
    async executeCommand(command, options, onApprovalRequired) {
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
            }
            else {
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
            const child = (0, child_process_1.spawn)(shellExecutable, shellArgs, {
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
    killProcess(processId) {
        const child = this.activeProcesses.get(processId);
        if (child) {
            if (os.platform() === 'win32') {
                (0, child_process_1.spawn)('taskkill', ['/pid', child.pid.toString(), '/f', '/t']);
            }
            else {
                child.kill('SIGKILL');
            }
            this.activeProcesses.delete(processId);
            return true;
        }
        return false;
    }
}
exports.TerminalSandbox = TerminalSandbox;
