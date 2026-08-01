"use strict";
/**
 * Kriti AI - Autonomous Coder Agent
 * Phase 2: Antigravity-Style Autonomous Loop with Self-Correction & Artifact Generation
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AutonomousCoderAgent = void 0;
class AutonomousCoderAgent {
    router;
    sandbox;
    fileManager;
    gateway;
    constructor(router, sandbox, fileManager, gateway) {
        this.router = router;
        this.sandbox = sandbox;
        this.fileManager = fileManager;
        this.gateway = gateway;
    }
    /**
     * Main Autonomous Execution Loop
     */
    async executeTask(task) {
        const maxIterations = task.maxIterations || 10;
        let iteration = 0;
        let isGoalAchieved = false;
        console.log(`[AutonomousCoder] 🤖 Starting task: "${task.goal}"`);
        // 1. Initial System Prompt
        const systemPrompt = `You are Kriti AI Autonomous Coder.
You have access to tools via JSON actions:
- READ_FILE: {"action": "READ_FILE", "path": "string"}
- WRITE_FILE: {"action": "WRITE_FILE", "path": "string", "content": "string"}
- EXEC_COMMAND: {"action": "EXEC_COMMAND", "command": "string"}
- COMPLETE_TASK: {"action": "COMPLETE_TASK", "summary": "string"}

Always structure your thought process into:
1. Thought: Analysis of current state
2. Action: The JSON action to execute
`;
        const conversation = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Goal: ${task.goal}\nPlease inspect the project, make necessary modifications, test your work, and fix any errors.` }
        ];
        while (iteration < maxIterations && !isGoalAchieved) {
            iteration++;
            console.log(`[AutonomousCoder] 🔄 Iteration ${iteration}/${maxIterations}...`);
            // 1. Request next step from LLM router
            const response = await this.router.routeCompletion(conversation);
            conversation.push({ role: 'assistant', content: response.content });
            this.gateway.broadcast({
                type: 'STREAM_CHUNK',
                sender: 'AGENT',
                payload: { iteration, text: response.content },
                timestamp: Date.now(),
                id: `chunk_${Date.now()}`
            });
            // 2. Parse Tool Action
            const actionMatch = response.content.match(/\{[\s\S]*"action"[\s\S]*\}/);
            if (!actionMatch) {
                console.log('[AutonomousCoder] No structured action detected. Checking completion.');
                break;
            }
            try {
                const actionObj = JSON.parse(actionMatch[0]);
                const toolResult = await this.handleAction(actionObj, task.workspacePath);
                // Feed tool result back to the model for reflection
                conversation.push({
                    role: 'user',
                    content: `TOOL_EXECUTION_RESULT:\n${toolResult}`
                });
                if (actionObj.action === 'COMPLETE_TASK') {
                    isGoalAchieved = true;
                    console.log(`[AutonomousCoder] 🎉 Goal Completed: ${actionObj.summary}`);
                }
            }
            catch (e) {
                conversation.push({
                    role: 'user',
                    content: `TOOL_EXECUTION_ERROR: ${e.message}\nPlease analyze this error and self-correct.`
                });
            }
        }
    }
    async handleAction(action, workspacePath) {
        switch (action.action) {
            case 'READ_FILE': {
                const content = await this.fileManager.readFile(action.path);
                return `File content of ${action.path}:\n${content.substring(0, 3000)}`;
            }
            case 'WRITE_FILE': {
                // Preview diff and request approval if needed
                const diffInfo = await this.fileManager.previewDiff(action.path, action.content);
                this.gateway.broadcast({
                    type: 'DIFF_ARTIFACT',
                    sender: 'AGENT',
                    payload: diffInfo,
                    timestamp: Date.now(),
                    id: `diff_${Date.now()}`
                });
                await this.fileManager.writeFile(action.path, action.content);
                return `Successfully wrote ${action.path}.`;
            }
            case 'EXEC_COMMAND': {
                const result = await this.sandbox.executeCommand(action.command, { cwd: workspacePath }, async (cmd, reason) => {
                    // Forward approval ping to Mobile / Desktop
                    return await this.gateway.requestApproval('TERMINAL_COMMAND', reason, { command: cmd });
                });
                return `Command: ${action.command}\nExit Code: ${result.exitCode}\nStdout: ${result.stdout}\nStderr: ${result.stderr}`;
            }
            case 'COMPLETE_TASK': {
                return `Task Marked as Completed.`;
            }
            default:
                throw new Error(`Unknown action type: ${action.action}`);
        }
    }
}
exports.AutonomousCoderAgent = AutonomousCoderAgent;
