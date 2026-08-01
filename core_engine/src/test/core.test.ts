/**
 * Kriti AI - Core Engine Automated Test Suite
 * Tests Sandbox Security, File Manager Diffs, Router Intent Logic, and Gateway WebSocket Sync
 */

import * as path from 'path';
import * as fs from 'fs';
import { WebSocket } from 'ws';
import { TerminalSandbox } from '../sandbox/TerminalSandbox';
import { SafeFileManager } from '../fs/SafeFileManager';
import { ModelRouter } from '../router/ModelRouter';
import { GatewayServer, SyncMessage } from '../sync/GatewayServer';

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
    const sandbox = new TerminalSandbox(testWorkspace);
    let threw = false;
    try {
      // Trying to execute outside workspace
      await sandbox.executeCommand('dir', { cwd: 'C:\\Windows\\System32' });
    } catch (e: any) {
      threw = true;
      console.log(`  -> Blocked illegal path: "${e.message}"`);
    }
    if (threw) {
      console.log('  ✅ [PASS] Jail successfully blocked path traversal.');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Sandbox allowed outside directory traversal.');
      failed++;
    }
  } catch (err: any) {
    console.error(`  ❌ [FAIL] Test 1 encountered error: ${err.message}`);
    failed++;
  }

  // Test 2: Safe File Manager - Atomic Write & Diff Preview & Rollback
  try {
    console.log('\n[Test 2] Testing Safe File Manager & Unified Diff Generator...');
    const fileMgr = new SafeFileManager(testWorkspace);
    const testFile = 'sample.ts';
    
    // Write initial
    await fileMgr.writeFile(testFile, 'export function hello() {\n  return "world";\n}\n');
    
    // Preview Diff
    const newContent = 'export function hello() {\n  return "kriti-ai-world";\n}\n';
    const diff = await fileMgr.previewDiff(testFile, newContent);

    if (diff.patch && diff.patch.includes('kriti-ai-world')) {
      console.log('  ✅ [PASS] Unified Diff created accurately with additions/deletions.');
      passed++;
    } else {
      console.error('  ❌ [FAIL] Unified Diff was malformed.');
      failed++;
    }

    // Write updated version
    await fileMgr.writeFile(testFile, newContent);
    const updatedContent = await fileMgr.readFile(testFile);
    if (updatedContent === newContent) {
      console.log('  ✅ [PASS] File content successfully persisted with atomic snapshot.');
      passed++;
    } else {
      console.error('  ❌ [FAIL] File content mismatch.');
      failed++;
    }
  } catch (err: any) {
    console.error(`  ❌ [FAIL] Test 2 encountered error: ${err.message}`);
    failed++;
  }

  // Test 3: Model Router - Intent Classifier
  try {
    console.log('\n[Test 3] Testing Model Router Intent Classifier...');
    const router = new ModelRouter();
    
    const intent1 = await router.classifyIntent('Send an email to John about tomorrow meeting');
    const intent2 = await router.classifyIntent('Refactor this TypeScript function to use async/await');
    
    if (intent1 === 'SYSTEM_ACTION' && intent2 === 'CODE_AUTONOMOUS') {
      console.log(`  -> "${intent1}" and "${intent2}" classified accurately.`);
      console.log('  ✅ [PASS] Intent router heuristics and classification passed.');
      passed++;
    } else {
      console.error(`  ❌ [FAIL] Intent mismatch: got ${intent1} and ${intent2}`);
      failed++;
    }
  } catch (err: any) {
    console.error(`  ❌ [FAIL] Test 3 encountered error: ${err.message}`);
    failed++;
  }

  // Test 4: Gateway Server - WebSocket Handshake & Approval Flow
  try {
    console.log('\n[Test 4] Testing Gateway Server WebSocket Handshake & Approvals...');
    const testPort = 19876;
    const gateway = new GatewayServer(testPort);

    await new Promise<void>((resolve, reject) => {
      const client = new WebSocket(`ws://127.0.0.1:${testPort}`);
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
          } else {
            console.error('  ❌ [FAIL] Approval did not resolve properly.');
            failed++;
            client.close();
            gateway.stop();
            resolve();
          }
        });
      });

      client.on('message', (data) => {
        const msg: SyncMessage = JSON.parse(data.toString());
        if (msg.type === 'STATUS_UPDATE' && msg.payload.state === 'CONNECTED') {
          ackReceived = true;
        } else if (msg.type === 'APPROVAL_REQUEST') {
          // Client approves the request
          client.send(
            JSON.stringify({
              type: 'APPROVAL_RESPONSE',
              sender: 'DESKTOP_UI',
              payload: { approvalId: msg.payload.approvalId, approved: true },
              timestamp: Date.now(),
              id: `resp_${Date.now()}`
            })
          );
        }
      });

      client.on('error', (err) => {
        console.error('  ❌ [FAIL] WebSocket client error:', err);
        failed++;
        gateway.stop();
        reject(err);
      });
    });
  } catch (err: any) {
    console.error(`  ❌ [FAIL] Test 4 encountered error: ${err.message}`);
    failed++;
  }

  // Clean up
  try {
    fs.rmSync(testWorkspace, { recursive: true, force: true });
  } catch {}

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

