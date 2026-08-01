"use strict";
/**
 * Kriti AI - Core Engine Automated Test Suite
 * Tests Sandbox Security, File Manager Diffs, Router Intent Logic, and Gateway WebSocket Sync
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
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
const ws_1 = require("ws");
const TerminalSandbox_1 = require("../sandbox/TerminalSandbox");
const SafeFileManager_1 = require("../fs/SafeFileManager");
const ModelRouter_1 = require("../router/ModelRouter");
const GatewayServer_1 = require("../sync/GatewayServer");
async function runTests() {
    console.log('==============================================');
    console.log('🧪 RUNNING KRITI AI CORE ENGINE TEST SUITE');
    console.log('==============================================');
    const testWorkspace = path.resolve(__dirname, '../../test_scratch');
    if (!fs.existsSync(testWorkspace)) {
        fs.mkdirSync(testWorkspace, { recursive: true });
    }
    let passed = 0;
    let failed = 0;
    // Test 1: Terminal Sandbox - Path Traversal Blocking
    try {
        console.log('\n[Test 1] Testing Terminal Sandbox Path Jail...');
        const sandbox = new TerminalSandbox_1.TerminalSandbox(testWorkspace);
        let threw = false;
        try {
            // Trying to execute outside workspace
            await sandbox.executeCommand('dir', { cwd: 'C:\\Windows\\System32' });
        }
        catch (e) {
            threw = true;
            console.log(`  -> Blocked illegal path: "${e.message}"`);
        }
        if (threw) {
            console.log('  ✅ [PASS] Jail successfully blocked path traversal.');
            passed++;
        }
        else {
            console.error('  ❌ [FAIL] Sandbox allowed outside directory traversal.');
            failed++;
        }
    }
    catch (err) {
        console.error(`  ❌ [FAIL] Test 1 encountered error: ${err.message}`);
        failed++;
    }
    // Test 2: Safe File Manager - Atomic Write & Diff Preview & Rollback
    try {
        console.log('\n[Test 2] Testing Safe File Manager & Unified Diff Generator...');
        const fileMgr = new SafeFileManager_1.SafeFileManager(testWorkspace);
        const testFile = 'sample.ts';
        // Write initial
        await fileMgr.writeFile(testFile, 'export function hello() {\n  return "world";\n}\n');
        // Preview Diff
        const newContent = 'export function hello() {\n  return "kriti-ai-world";\n}\n';
        const diff = await fileMgr.previewDiff(testFile, newContent);
        if (diff.patch && diff.patch.includes('kriti-ai-world')) {
            console.log('  ✅ [PASS] Unified Diff created accurately with additions/deletions.');
            passed++;
        }
        else {
            console.error('  ❌ [FAIL] Unified Diff was malformed.');
            failed++;
        }
        // Write updated version
        await fileMgr.writeFile(testFile, newContent);
        const updatedContent = await fileMgr.readFile(testFile);
        if (updatedContent === newContent) {
            console.log('  ✅ [PASS] File content successfully persisted with atomic snapshot.');
            passed++;
        }
        else {
            console.error('  ❌ [FAIL] File content mismatch.');
            failed++;
        }
    }
    catch (err) {
        console.error(`  ❌ [FAIL] Test 2 encountered error: ${err.message}`);
        failed++;
    }
    // Test 3: Model Router - Intent Classifier
    try {
        console.log('\n[Test 3] Testing Model Router Intent Classifier...');
        const router = new ModelRouter_1.ModelRouter();
        const intent1 = await router.classifyIntent('Send an email to John about tomorrow meeting');
        const intent2 = await router.classifyIntent('Refactor this TypeScript function to use async/await');
        if (intent1 === 'SYSTEM_ACTION' && intent2 === 'CODE_AUTONOMOUS') {
            console.log(`  -> "${intent1}" and "${intent2}" classified accurately.`);
            console.log('  ✅ [PASS] Intent router heuristics and classification passed.');
            passed++;
        }
        else {
            console.error(`  ❌ [FAIL] Intent mismatch: got ${intent1} and ${intent2}`);
            failed++;
        }
    }
    catch (err) {
        console.error(`  ❌ [FAIL] Test 3 encountered error: ${err.message}`);
        failed++;
    }
    // Test 4: Gateway Server - WebSocket Handshake & Approval Flow
    try {
        console.log('\n[Test 4] Testing Gateway Server WebSocket Handshake & Approvals...');
        const testPort = 19876;
        const gateway = new GatewayServer_1.GatewayServer(testPort);
        await new Promise((resolve, reject) => {
            const client = new ws_1.WebSocket(`ws://127.0.0.1:${testPort}`);
            let ackReceived = false;
            client.on('open', () => {
                // Trigger an approval request from the server
                gateway.requestApproval('FILE_WRITE', 'Modify critical config file', { file: 'config.ts' }).then((approved) => {
                    if (approved && ackReceived) {
                        console.log('  ✅ [PASS] Gateway WebSocket handshake and approval resolution verified.');
                        passed++;
                        client.close();
                        gateway.stop();
                        resolve();
                    }
                    else {
                        console.error('  ❌ [FAIL] Approval did not resolve properly.');
                        failed++;
                        client.close();
                        gateway.stop();
                        resolve();
                    }
                });
            });
            client.on('message', (data) => {
                const msg = JSON.parse(data.toString());
                if (msg.type === 'STATUS_UPDATE' && msg.payload.state === 'CONNECTED') {
                    ackReceived = true;
                }
                else if (msg.type === 'APPROVAL_REQUEST') {
                    // Client approves the request
                    client.send(JSON.stringify({
                        type: 'APPROVAL_RESPONSE',
                        sender: 'DESKTOP_UI',
                        payload: { approvalId: msg.payload.approvalId, approved: true },
                        timestamp: Date.now(),
                        id: `resp_${Date.now()}`
                    }));
                }
            });
            client.on('error', (err) => {
                console.error('  ❌ [FAIL] WebSocket client error:', err);
                failed++;
                gateway.stop();
                reject(err);
            });
        });
    }
    catch (err) {
        console.error(`  ❌ [FAIL] Test 4 encountered error: ${err.message}`);
        failed++;
    }
    // Clean up
    try {
        fs.rmSync(testWorkspace, { recursive: true, force: true });
    }
    catch { }
    console.log('\n==============================================');
    console.log(`🏁 TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log('==============================================');
    if (failed > 0) {
        process.exit(1);
    }
}
runTests().catch((e) => {
    console.error('Fatal test error:', e);
    process.exit(1);
});
