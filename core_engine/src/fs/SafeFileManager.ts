/**
 * Kriti AI - Safe File System & Diff Management Engine
 * Phase 2: Sandboxed File Operations, Unified Diff Generation & Rollback
 */

import * as fs from 'fs-extra';
import * as path from 'path';
import * as diff from 'diff';

export interface FileDiffResult {
  filePath: string;
  originalContent: string;
  newContent: string;
  patch: string;
  isNewFile: boolean;
}

export class SafeFileManager {
  private workspaceRoot: string;
  private backupDir: string;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.backupDir = path.join(this.workspaceRoot, '.kritiai_backups');
  }

  /**
   * Sanitizes relative/absolute path to ensure it stays strictly within the workspace
   */
  public resolveSafePath(targetPath: string): string {
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
  public async readFile(targetPath: string): Promise<string> {
    const safePath = this.resolveSafePath(targetPath);
    if (!await fs.pathExists(safePath)) {
      throw new Error(`File not found: ${targetPath}`);
    }
    return fs.readFile(safePath, 'utf8');
  }

  /**
   * Generates a unified diff before applying changes (Antigravity-style artifact preview)
   */
  public async previewDiff(targetPath: string, newContent: string): Promise<FileDiffResult> {
    const safePath = this.resolveSafePath(targetPath);
    const exists = await fs.pathExists(safePath);
    const originalContent = exists ? await fs.readFile(safePath, 'utf8') : '';

    const patch = diff.createTwoFilesPatch(
      exists ? targetPath : '/dev/null',
      targetPath,
      originalContent,
      newContent,
      'original',
      'proposed'
    );

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
  public async writeFile(targetPath: string, content: string): Promise<{ backupId: string; safePath: string }> {
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
  public async rollback(targetPath: string, backupId: string): Promise<void> {
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
  public async listDirectoryTree(dirPath: string = '.', depth: number = 3): Promise<any> {
    const safePath = this.resolveSafePath(dirPath);
    const ignored = new Set(['node_modules', '.git', '.kritiai_backups', 'dist', 'build', '.cache', '__pycache__']);

    const scan = async (currentDir: string, currentDepth: number): Promise<any[]> => {
      if (currentDepth > depth) return [];
      const entries = await fs.readdir(currentDir, { withFileTypes: true });
      const results: any[] = [];

      for (const entry of entries) {
        if (ignored.has(entry.name)) continue;
        const entryPath = path.join(currentDir, entry.name);
        const relPath = path.relative(this.workspaceRoot, entryPath);

        if (entry.isDirectory()) {
          results.push({
            name: entry.name,
            path: relPath,
            type: 'directory',
            children: await scan(entryPath, currentDepth + 1)
          });
        } else {
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
