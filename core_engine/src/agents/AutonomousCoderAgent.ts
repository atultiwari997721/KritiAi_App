/**
 * Kriti AI - Autonomous Coder Agent
 * Antigravity-Style Autonomous Loop with Self-Correction, Multi-Step Plan Execution & Unified Diff Artifacts
 */

import { ModelRouter, ModelMessage } from '../router/ModelRouter';
import { TerminalSandbox } from '../sandbox/TerminalSandbox';
import { SafeFileManager } from '../fs/SafeFileManager';
import { GatewayServer } from '../sync/GatewayServer';

export interface AgentTask {
  goal: string;
  workspacePath: string;
  maxIterations?: number;
}

export class AutonomousCoderAgent {
  private router: ModelRouter;
  private sandbox: TerminalSandbox;
  private fileManager: SafeFileManager;
  private gateway: GatewayServer;

  constructor(
    router: ModelRouter,
    sandbox: TerminalSandbox,
    fileManager: SafeFileManager,
    gateway: GatewayServer
  ) {
    this.router = router;
    this.sandbox = sandbox;
    this.fileManager = fileManager;
    this.gateway = gateway;
  }

  /**
   * Main Autonomous Execution Loop
   */
  public async executeTask(task: AgentTask): Promise<void> {
    const maxIterations = task.maxIterations || 6;
    let iteration = 0;
    let isGoalAchieved = false;

    console.log(`[AutonomousCoder] 🤖 Starting task: "${task.goal}"`);

    this.gateway.broadcast({
      type: 'STREAM_CHUNK',
      sender: 'AGENT',
      payload: {
        iteration: 0,
        text: `Starting autonomous task: "${task.goal}"\nAnalyzing workspace and dependencies...`
      },
      timestamp: Date.now(),
      id: `chunk_${Date.now()}`
    });

    const systemPrompt = `You are Kriti AI Autonomous Coder and Software Architect.
You can read/write files and execute sandboxed terminal commands.
Format your actions using JSON inside a code block or JSON object:
- Read File: {"action": "READ_FILE", "path": "path/to/file"}
- Write/Refactor File: {"action": "WRITE_FILE", "path": "path/to/file", "content": "full updated code"}
- Run Command: {"action": "EXEC_COMMAND", "command": "npm test"}
- Complete: {"action": "COMPLETE_TASK", "summary": "Detailed explanation of changes made"}

Always provide clear architectural explanations and make robust, production-quality changes.`;

    const conversation: ModelMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: task.goal }
    ];

    while (iteration < maxIterations && !isGoalAchieved) {
      iteration++;
      console.log(`[AutonomousCoder] 🔄 Step ${iteration}/${maxIterations}...`);

      const response = await this.router.routeCompletion(conversation);
      conversation.push({ role: 'assistant', content: response.content });

      // Broadcast reasoning step to telemetry feed
      this.gateway.broadcast({
        type: 'STREAM_CHUNK',
        sender: 'AGENT',
        payload: { iteration, text: response.content },
        timestamp: Date.now(),
        id: `chunk_${Date.now()}`
      });

      // Also send message to chat stream
      this.gateway.broadcast({
        type: 'CHAT_MESSAGE',
        sender: 'AGENT',
        payload: { text: response.content },
        timestamp: Date.now(),
        id: `agent_msg_${Date.now()}`
      });

      // Try parsing JSON Action
      const actionMatch = response.content.match(/\{[\s\S]*?"action"\s*:\s*"([A-Z_]+)"[\s\S]*?\}/);
      
      if (actionMatch) {
        try {
          const actionObj = JSON.parse(actionMatch[0]);
          const toolResult = await this.handleAction(actionObj, task.workspacePath);

          conversation.push({
            role: 'user',
            content: `TOOL_EXECUTION_RESULT:\n${toolResult}`
          });

          if (actionObj.action === 'COMPLETE_TASK') {
            isGoalAchieved = true;
            console.log(`[AutonomousCoder] 🎉 Goal Completed: ${actionObj.summary}`);
            break;
          }
        } catch (e: any) {
          conversation.push({
            role: 'user',
            content: `TOOL_EXECUTION_ERROR: ${e.message}\nPlease fix and continue.`
          });
        }
      } else {
        // Fallback: Check if response contains proposed file code block for the requested file
        const codeBlockMatch = response.content.match(/```(?:typescript|javascript|tsx|jsx|python|css|html|json)?\n([\s\S]+?)```/);
        const fileTargetMatch = task.goal.match(/(?:File:|in|for)\s+([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)/i);

        if (codeBlockMatch && fileTargetMatch) {
          const targetFile = fileTargetMatch[1];
          const newCode = codeBlockMatch[1];
          try {
            const diffInfo = await this.fileManager.previewDiff(targetFile, newCode);
            this.gateway.broadcast({
              type: 'DIFF_ARTIFACT',
              sender: 'AGENT',
              payload: diffInfo,
              timestamp: Date.now(),
              id: `diff_${Date.now()}`
            });
            console.log(`[AutonomousCoder] ⚡ Auto-generated unified diff artifact for ${targetFile}`);
          } catch (diffErr) {
            console.warn('[AutonomousCoder] Could not generate diff artifact:', diffErr);
          }
        }

        console.log('[AutonomousCoder] Step finished cleanly.');
        break;
      }
    }
  }

  private async handleAction(action: any, workspacePath: string): Promise<string> {
    switch (action.action) {
      case 'READ_FILE': {
        const content = await this.fileManager.readFile(action.path);
        return `File content of ${action.path}:\n${content.substring(0, 4000)}`;
      }

      case 'WRITE_FILE': {
        const diffInfo = await this.fileManager.previewDiff(action.path, action.content);
        
        this.gateway.broadcast({
          type: 'DIFF_ARTIFACT',
          sender: 'AGENT',
          payload: diffInfo,
          timestamp: Date.now(),
          id: `diff_${Date.now()}`
        });

        await this.fileManager.writeFile(action.path, action.content);
        return `Successfully saved ${action.path} and published unified diff artifact.`;
      }

      case 'EXEC_COMMAND': {
        const result = await this.sandbox.executeCommand(
          action.command,
          { cwd: workspacePath },
          async (cmd, reason) => {
            return await this.gateway.requestApproval('TERMINAL_COMMAND', reason, { command: cmd });
          }
        );
        return `Command: ${action.command}\nExit Code: ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`;
      }

      case 'COMPLETE_TASK': {
        return `Task Marked as Completed: ${action.summary || 'Done'}`;
      }

      default:
        throw new Error(`Unknown action type: ${action.action}`);
    }
  }
}
