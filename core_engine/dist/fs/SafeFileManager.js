"use strict";
/**
 * Kriti AI - Safe File System & Diff Management Engine
 * Phase 2: Sandboxed File Operations, Unified Diff Generation & Rollback
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
exports.SafeFileManager = void 0;
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const diff = __importStar(require("diff"));
class SafeFileManager {
    workspaceRoot;
    backupDir;
    constructor(workspaceRoot) {
        this.workspaceRoot = path.resolve(workspaceRoot);
        this.backupDir = path.join(this.workspaceRoot, '.kritiai_backups');
    }
    /**
     * Sanitizes relative/absolute path to ensure it stays strictly within the workspace
     */
    resolveSafePath(targetPath) {
        const resolved = path.isAbsolute(targetPath)
            ? path.resolve(targetPath)
            : path.resolve(this.workspaceRoot, targetPath);
        const relative = path.relative(this.workspaceRoot, resolved);
        if (relative.startsWith('..') || path.isAbsolute(relative)) {
            throw new Error(`Access Denied: Path '${targetPath}' attempts to escape workspace root '${this.workspaceRoot}'`);
        }
        return resolved;
    }
    /**
     * Reads a file securely
     */
    async readFile(targetPath) {
        const safePath = this.resolveSafePath(targetPath);
        if (!await fs.pathExists(safePath)) {
            throw new Error(`File not found: ${targetPath}`);
        }
        return fs.readFile(safePath, 'utf8');
    }
    /**
     * Generates a unified diff before applying changes (Antigravity-style artifact preview)
     */
    async previewDiff(targetPath, newContent) {
        const safePath = this.resolveSafePath(targetPath);
        const exists = await fs.pathExists(safePath);
        const originalContent = exists ? await fs.readFile(safePath, 'utf8') : '';
        const patch = diff.createTwoFilesPatch(exists ? targetPath : '/dev/null', targetPath, originalContent, newContent, 'original', 'proposed');
        return {
            filePath: targetPath,
            originalContent,
            newContent,
            patch,
            isNewFile: !exists
        };
    }
    /**
     * Atomically writes a file after taking a rollback snapshot
     */
    async writeFile(targetPath, content) {
        const safePath = this.resolveSafePath(targetPath);
        await fs.ensureDir(path.dirname(safePath));
        // Create Backup Snapshot
        const backupId = `snap_${Date.now()}_${path.basename(safePath)}`;
        await fs.ensureDir(this.backupDir);
        if (await fs.pathExists(safePath)) {
            const backupPath = path.join(this.backupDir, backupId);
            await fs.copyFile(safePath, backupPath);
        }
        // Write file safely
        await fs.writeFile(safePath, content, 'utf8');
        return { backupId, safePath };
    }
    /**
     * Rollback file from a specific snapshot ID
     */
    async rollback(targetPath, backupId) {
        const safePath = this.resolveSafePath(targetPath);
        const backupPath = path.join(this.backupDir, backupId);
        if (!await fs.pathExists(backupPath)) {
            throw new Error(`Rollback snapshot '${backupId}' does not exist.`);
        }
        await fs.copyFile(backupPath, safePath);
    }
    /**
     * Lists directory tree recursively with ignored standard junk folders
     */
    async listDirectoryTree(dirPath = '.', depth = 3) {
        const safePath = this.resolveSafePath(dirPath);
        const ignored = new Set(['node_modules', '.git', '.kritiai_backups', 'dist', 'build', '.cache', '__pycache__']);
        const scan = async (currentDir, currentDepth) => {
            if (currentDepth > depth)
                return [];
            const entries = await fs.readdir(currentDir, { withFileTypes: true });
            const results = [];
            for (const entry of entries) {
                if (ignored.has(entry.name))
                    continue;
                const entryPath = path.join(currentDir, entry.name);
                const relPath = path.relative(this.workspaceRoot, entryPath);
                if (entry.isDirectory()) {
                    results.push({
                        name: entry.name,
                        path: relPath,
                        type: 'directory',
                        children: await scan(entryPath, currentDepth + 1)
                    });
                }
                else {
                    results.push({
                        name: entry.name,
                        path: relPath,
                        type: 'file',
                        size: (await fs.stat(entryPath)).size
                    });
                }
            }
            return results;
        };
        return {
            root: path.relative(this.workspaceRoot, safePath) || '.',
            tree: await scan(safePath, 1)
        };
    }
}
exports.SafeFileManager = SafeFileManager;
