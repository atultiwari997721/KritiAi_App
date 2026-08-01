/**
 * Kriti AI - Master Core Engine Bootloader
 * Orchestrates Router, Sandbox, File System, Gateway Server, and Agents
 */

import * as dotenv from 'dotenv';
import * as path from 'path';
import { ModelRouter } from './router/ModelRouter';
import { TerminalSandbox } from './sandbox/TerminalSandbox';
import { SafeFileManager } from './fs/SafeFileManager';
import { GatewayServer } from './sync/GatewayServer';
import { AutonomousCoderAgent } from './agents/AutonomousCoderAgent';
import { PersonalAssistantAgent } from './agents/PersonalAssistantAgent';

dotenv.config();

async function bootstrap() {
  console.log('====================================================');
  console.log('⚡ KRITI AI - MASTER CORE ENGINE INITIALIZING ⚡');
  console.log('====================================================');

  const workspaceRoot = process.env.WORKSPACE_ROOT || path.resolve(__dirname, '../../');
  const port = parseInt(process.env.PORT || '9876', 10);

  // 1. Initialize Subsystems
  const router = new ModelRouter({
    ollamaBaseUrl: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434',
    customKritiAiApiUrl: process.env.KRITIAI_CUSTOM_API_URL,
    cloudFallbackApiKey: process.env.GROQ_API_KEY
  });

  const sandbox = new TerminalSandbox(workspaceRoot);
  const fileManager = new SafeFileManager(workspaceRoot);
  const gateway = new GatewayServer(port);

  // Forward sandbox streams to connected clients
  sandbox.on('stdout', ({ data }) => {
    gateway.broadcast({
      type: 'COMMAND_OUTPUT',
      sender: 'WINDOWS_HOST',
      payload: { text: data, stream: 'stdout' },
      timestamp: Date.now(),
      id: `out_${Date.now()}`
    });
  });

  sandbox.on('stderr', ({ data }) => {
    gateway.broadcast({
      type: 'COMMAND_OUTPUT',
      sender: 'WINDOWS_HOST',
      payload: { text: data, stream: 'stderr' },
      timestamp: Date.now(),
      id: `err_${Date.now()}`
    });
  });

  // 2. Initialize Agents
  const coderAgent = new AutonomousCoderAgent(router, sandbox, fileManager, gateway);
  const assistantAgent = new PersonalAssistantAgent(gateway, router);

  // 3. Check Engine Health
  const ollamaOnline = await router.isOllamaAlive();
  console.log(`[Status] Local Ollama Engine: ${ollamaOnline ? '🟢 ONLINE' : '🔴 OFFLINE (Run: ollama serve)'}`);

  const colabOnline = await router.isCustomGpuAlive();
  console.log(`[Status] Custom KritiAi GPU Node: ${colabOnline ? '🟢 ONLINE' : '⚪ IDLE (Connect Colab/HF endpoint)'}`);

  // 4. Handle incoming user messages from Mobile/Desktop
  gateway.on('chat_received', async (payload: { text: string; mode?: 'assistant' | 'coder' }) => {
    console.log(`[CoreEngine] 📥 Processing input: "${payload.text}" (Mode: ${payload.mode || 'assistant'})`);

    if (payload.mode === 'coder') {
      try {
        await coderAgent.executeTask({
          goal: payload.text,
          workspacePath: workspaceRoot
        });
      } catch (e: any) {
        gateway.broadcast({
          type: 'CHAT_MESSAGE',
          sender: 'AGENT',
          payload: { text: `⚠️ Agent execution encountered an issue: ${e.message}` },
          timestamp: Date.now(),
          id: `msg_err_${Date.now()}`
        });
      }
    } else {
      try {
        const response = await router.routeCompletion([
          { role: 'system', content: 'You are Kriti AI, the omnipotent personal assistant and autonomous IDE engine.' },
          { role: 'user', content: payload.text }
        ]);

        gateway.broadcast({
          type: 'CHAT_MESSAGE',
          sender: 'WINDOWS_HOST',
          payload: { text: response.content, meta: response },
          timestamp: Date.now(),
          id: `msg_${Date.now()}`
        });
      } catch (err: any) {
        gateway.broadcast({
          type: 'CHAT_MESSAGE',
          sender: 'WINDOWS_HOST',
          payload: { text: `Error generating response: ${err.message}` },
          timestamp: Date.now(),
          id: `msg_err_${Date.now()}`
        });
      }
    }
  });

  // Handle Terminal Execution Requests
  gateway.on('command_execute', async (payload: { command: string }, clientWs) => {
    const { command } = payload;
    console.log(`[CoreEngine] 🖥️ Executing terminal command: "${command}"`);

    gateway.broadcast({
      type: 'COMMAND_OUTPUT',
      sender: 'WINDOWS_HOST',
      payload: { text: `$ ${command}\n`, stream: 'stdout' },
      timestamp: Date.now(),
      id: `cmd_start_${Date.now()}`
    });

    try {
      const result = await sandbox.executeCommand(
        command,
        { cwd: workspaceRoot },
        async (cmd, reason) => {
          return await gateway.requestApproval('TERMINAL_COMMAND', reason, { command: cmd });
        }
      );

      gateway.broadcast({
        type: 'COMMAND_OUTPUT',
        sender: 'WINDOWS_HOST',
        payload: {
          text: result.stdout + (result.stderr ? `\n[STDERR]: ${result.stderr}` : '') + `\n[Process exited with code ${result.exitCode}]\n`,
          stream: 'stdout'
        },
        timestamp: Date.now(),
        id: `cmd_done_${Date.now()}`
      });
    } catch (e: any) {
      gateway.broadcast({
        type: 'COMMAND_OUTPUT',
        sender: 'WINDOWS_HOST',
        payload: { text: `[Execution Error]: ${e.message}\n`, stream: 'stderr' },
        timestamp: Date.now(),
        id: `cmd_fail_${Date.now()}`
      });
    }
  });

  // Handle Directory Tree Requests
  gateway.on('get_file_tree', async (_payload, clientWs) => {
    try {
      const tree = await fileManager.listDirectoryTree('.', 4);
      gateway.sendToClient(clientWs, {
        type: 'FILE_TREE_DATA',
        sender: 'WINDOWS_HOST',
        payload: tree,
        timestamp: Date.now(),
        id: `tree_${Date.now()}`
      });
    } catch (e: any) {
      console.error('[CoreEngine] Failed to get file tree:', e);
    }
  });

  // Handle Read File Requests
  gateway.on('read_file', async (payload: { path: string }, clientWs) => {
    try {
      const content = await fileManager.readFile(payload.path);
      gateway.sendToClient(clientWs, {
        type: 'FILE_CONTENT',
        sender: 'WINDOWS_HOST',
        payload: { path: payload.path, content },
        timestamp: Date.now(),
        id: `file_${Date.now()}`
      });
    } catch (e: any) {
      gateway.sendToClient(clientWs, {
        type: 'FILE_CONTENT',
        sender: 'WINDOWS_HOST',
        payload: { path: payload.path, content: `// Error reading file: ${e.message}` },
        timestamp: Date.now(),
        id: `file_err_${Date.now()}`
      });
    }
  });

  // Handle Save File Requests
  gateway.on('save_file', async (payload: { path: string; content: string }, clientWs) => {
    try {
      const diffInfo = await fileManager.previewDiff(payload.path, payload.content);
      await fileManager.writeFile(payload.path, payload.content);

      gateway.broadcast({
        type: 'DIFF_ARTIFACT',
        sender: 'WINDOWS_HOST',
        payload: diffInfo,
        timestamp: Date.now(),
        id: `diff_${Date.now()}`
      });
    } catch (e: any) {
      console.error('[CoreEngine] Failed to save file:', e);
    }
  });

  // Handle Telemetry Status Requests
  gateway.on('get_status', async (_payload, clientWs) => {
    const isOllama = await router.isOllamaAlive();
    const isColab = await router.isCustomGpuAlive();
    gateway.sendToClient(clientWs, {
      type: 'STATUS_UPDATE',
      sender: 'WINDOWS_HOST',
      payload: {
        ollama: isOllama,
        colabGpu: isColab,
        workspaceRoot
      },
      timestamp: Date.now(),
      id: `stat_${Date.now()}`
    });
  });

  console.log(`\n✨ Kriti AI Core Engine is ready and awaiting commands on ws://127.0.0.1:${port}`);
}

bootstrap().catch((err) => {
  console.error('Fatal initialization error:', err);
});
