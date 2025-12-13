#!/usr/bin/env node
/**
 * Kestra Flow Deployment Script (Interactive)
 *
 * Supports deployment to both LOCAL Kestra (Docker) and KESTRA CLOUD.
 *
 * Features:
 *   - Interactive mode selection (Local/Cloud)
 *   - For Cloud: Copies flows to prod_flows/, transforms envs→secrets, deploys
 *   - For Local: Deploys directly from flows/
 *   - Bearer token auth for Cloud, Basic auth for Local
 *
 * Usage:
 *   node deploy-flows.js [options]
 *
 * Options:
 *   --local       Deploy to local Kestra (skip interactive prompt)
 *   --cloud       Deploy to Kestra Cloud (skip interactive prompt)
 *   --dry-run     Preview what would be deployed without making changes
 *   --namespace   Override the default namespace (default: ai_concierge)
 *   --help        Show this help message
 *
 * Environment Variables:
 *   LOCAL:
 *     KESTRA_LOCAL_URL       - Local Kestra URL (default: http://localhost:8082)
 *     KESTRA_LOCAL_USERNAME  - Basic auth username (default: admin@kestra.local)
 *     KESTRA_LOCAL_PASSWORD  - Basic auth password (default: Admin123456)
 *
 *   CLOUD:
 *     KESTRA_CLOUD_URL       - Kestra Cloud URL (e.g., https://prod.myorg.kestra.cloud)
 *     KESTRA_CLOUD_TENANT    - Kestra Cloud tenant (default: main)
 *     KESTRA_API_TOKEN       - Kestra Cloud API token
 *
 *   SHARED:
 *     KESTRA_NAMESPACE       - Default namespace (default: ai_concierge)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

// ============================================================================
// CONFIGURATION
// ============================================================================

const EXTENSIONS = ['.yaml', '.yml'];
const FLOWS_DIR = path.join(__dirname, '..', 'flows');
const PROD_FLOWS_DIR = path.join(__dirname, '..', 'prod_flows');
const SCRIPTS_DIR = path.join(__dirname);
const API_DIST_VAPI_DIR = path.join(__dirname, '..', '..', 'apps', 'api', 'dist', 'services', 'vapi');

// Compiled config files that need to be copied to scripts/ for Kestra Cloud
const REQUIRED_CONFIGS = [
    'assistant-config.js',
    'booking-assistant-config.js',
    'webhook-config.js',
];

// Transformation pattern for Cloud migration
const ENVS_PATTERN = /\{\{\s*envs\.(\w+)\s*\}\}/g;

const CONFIG = {
    // Local Kestra (Docker)
    local: {
        url: process.env.KESTRA_LOCAL_URL || 'http://localhost:8082',
        username: process.env.KESTRA_LOCAL_USERNAME || 'admin@kestra.local',
        password: process.env.KESTRA_LOCAL_PASSWORD || 'Admin123456',
    },
    // Kestra Cloud
    cloud: {
        url: process.env.KESTRA_CLOUD_URL || '',
        tenant: process.env.KESTRA_CLOUD_TENANT || 'main',
        apiToken: process.env.KESTRA_API_TOKEN || '',
    },
    // Shared
    namespace: process.env.KESTRA_NAMESPACE || 'ai_concierge',
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function printHeader(title) {
    const line = '='.repeat(65);
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(`${line}`);
}

function printSubHeader(text) {
    console.log(`\n  ${text}`);
    console.log(`  ${'-'.repeat(text.length)}`);
}

function printBox(lines, color = '') {
    const maxLen = Math.max(...lines.map(l => l.length));
    const border = '+' + '-'.repeat(maxLen + 2) + '+';
    console.log(`\n  ${color}${border}\x1b[0m`);
    lines.forEach(line => {
        const padding = ' '.repeat(maxLen - line.length);
        console.log(`  ${color}| ${line}${padding} |\x1b[0m`);
    });
    console.log(`  ${color}${border}\x1b[0m`);
}

async function promptUser(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            rl.close();
            resolve(answer.trim().toLowerCase());
        });
    });
}

function findYamlFiles(dir) {
    const files = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                files.push(...findYamlFiles(fullPath));
            }
        } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
            if (!entry.name.endsWith('.bak')) {
                files.push(fullPath);
            }
        }
    }

    return files;
}

function extractFlowId(content) {
    const match = content.match(/^id:\s*(\S+)/m);
    return match ? match[1] : null;
}

function extractNamespace(content) {
    const match = content.match(/^namespace:\s*(\S+)/m);
    return match ? match[1] : null;
}

function findScriptFiles(dir) {
    const files = [];
    const SCRIPT_EXTENSIONS = ['.js', '.ts', '.sh', '.py'];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                files.push(...findScriptFiles(fullPath));
            }
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (SCRIPT_EXTENSIONS.includes(ext) &&
                entry.name !== 'deploy-flows.js' &&
                entry.name !== 'migrate-envs-to-secrets.js') {
                files.push(fullPath);
            }
        }
    }

    return files;
}

// ============================================================================
// CLOUD PREPARATION FUNCTIONS
// ============================================================================

function clearProdFlowsDir() {
    if (!fs.existsSync(PROD_FLOWS_DIR)) {
        fs.mkdirSync(PROD_FLOWS_DIR, { recursive: true });
        return 0;
    }

    const files = fs.readdirSync(PROD_FLOWS_DIR);
    let deleted = 0;

    for (const file of files) {
        const fullPath = path.join(PROD_FLOWS_DIR, file);
        const stat = fs.statSync(fullPath);

        if (stat.isFile()) {
            fs.unlinkSync(fullPath);
            deleted++;
        } else if (stat.isDirectory()) {
            fs.rmSync(fullPath, { recursive: true });
            deleted++;
        }
    }

    return deleted;
}

function copyFlowsToProd() {
    const sourceFiles = findYamlFiles(FLOWS_DIR);
    const copied = [];

    for (const sourceFile of sourceFiles) {
        const relativePath = path.relative(FLOWS_DIR, sourceFile);
        const destPath = path.join(PROD_FLOWS_DIR, relativePath);

        // Ensure destination directory exists
        const destDir = path.dirname(destPath);
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        // Copy file
        fs.copyFileSync(sourceFile, destPath);
        copied.push({ source: relativePath, dest: destPath });
    }

    return copied;
}

function transformEnvsToSecrets(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const matches = [];

    // Find all envs references
    let match;
    const pattern = /\{\{\s*envs\.(\w+)\s*\}\}/g;
    while ((match = pattern.exec(content)) !== null) {
        matches.push(match[1]);
    }

    if (matches.length === 0) {
        return { transformed: false, secrets: [] };
    }

    // Transform content
    const newContent = content.replace(ENVS_PATTERN, "{{ secret('$1') }}");
    fs.writeFileSync(filePath, newContent, 'utf-8');

    return { transformed: true, secrets: [...new Set(matches)] };
}

/**
 * Copy compiled TypeScript config files from apps/api/dist to kestra/scripts
 * These configs are required by call-provider.js and schedule-booking.js
 */
function copyCompiledConfigs(dryRun = false) {
    const results = {
        copied: [],
        missing: [],
        errors: [],
    };

    // Check if dist directory exists
    if (!fs.existsSync(API_DIST_VAPI_DIR)) {
        return {
            ...results,
            errors: [`Dist directory not found: ${API_DIST_VAPI_DIR}`],
            needsBuild: true,
        };
    }

    for (const configFile of REQUIRED_CONFIGS) {
        const sourcePath = path.join(API_DIST_VAPI_DIR, configFile);
        const destPath = path.join(SCRIPTS_DIR, configFile);

        if (!fs.existsSync(sourcePath)) {
            results.missing.push(configFile);
            continue;
        }

        if (dryRun) {
            results.copied.push({ file: configFile, dryRun: true });
        } else {
            try {
                fs.copyFileSync(sourcePath, destPath);
                results.copied.push({ file: configFile, dryRun: false });
            } catch (error) {
                results.errors.push(`Failed to copy ${configFile}: ${error.message}`);
            }
        }
    }

    return results;
}

function prepareProdFlows(dryRun = false) {
    printSubHeader('Preparing Cloud-ready flows');

    // Step 1: Clear prod_flows directory
    console.log(`\n    \x1b[33m1. Clearing prod_flows directory...\x1b[0m`);
    if (dryRun) {
        console.log(`       \x1b[36m[Dry-run: would delete all files in prod_flows/]\x1b[0m`);
    } else {
        const deleted = clearProdFlowsDir();
        console.log(`       Deleted ${deleted} existing file(s)`);
    }

    // Step 2: Copy flows to prod_flows
    console.log(`\n    \x1b[33m2. Copying flows to prod_flows/...\x1b[0m`);
    let copiedFiles = [];
    if (dryRun) {
        const sourceFiles = findYamlFiles(FLOWS_DIR);
        console.log(`       \x1b[36m[Dry-run: would copy ${sourceFiles.length} file(s)]\x1b[0m`);
        copiedFiles = sourceFiles.map(f => ({ source: path.basename(f), dest: f }));
    } else {
        copiedFiles = copyFlowsToProd();
        console.log(`       Copied ${copiedFiles.length} flow file(s)`);
        copiedFiles.forEach(f => {
            console.log(`         \x1b[32m✓\x1b[0m ${f.source}`);
        });
    }

    // Step 3: Transform envs → secrets
    console.log(`\n    \x1b[33m3. Transforming envs → secret()...\x1b[0m`);
    const allSecrets = new Set();
    let transformedCount = 0;

    if (dryRun) {
        // Preview what would be transformed
        const sourceFiles = findYamlFiles(FLOWS_DIR);
        for (const file of sourceFiles) {
            const content = fs.readFileSync(file, 'utf-8');
            const matches = content.match(ENVS_PATTERN);
            if (matches) {
                console.log(`       \x1b[36m[Would transform ${path.basename(file)}: ${matches.length} reference(s)]\x1b[0m`);
                matches.forEach(m => {
                    const varName = m.match(/envs\.(\w+)/)[1];
                    allSecrets.add(varName);
                });
                transformedCount++;
            }
        }
    } else {
        const prodFiles = findYamlFiles(PROD_FLOWS_DIR);
        for (const file of prodFiles) {
            const result = transformEnvsToSecrets(file);
            if (result.transformed) {
                transformedCount++;
                result.secrets.forEach(s => allSecrets.add(s));
                console.log(`       \x1b[32m✓\x1b[0m ${path.basename(file)}: ${result.secrets.length} reference(s) transformed`);
            }
        }
    }

    if (transformedCount === 0) {
        console.log(`       (no envs references found)`);
    }

    // Show required secrets
    if (allSecrets.size > 0) {
        console.log(`\n    \x1b[33m4. Required Kestra Cloud Secrets:\x1b[0m`);
        console.log(`       Add these in: Namespace Settings → Secrets → Add Secret\n`);
        [...allSecrets].sort().forEach(secret => {
            const envVar = secret.toUpperCase();
            console.log(`       • ${secret}  ←  $${envVar}`);
        });
    }

    return {
        copiedCount: copiedFiles.length,
        transformedCount,
        secrets: [...allSecrets],
    };
}

// ============================================================================
// NAMESPACE FILE FUNCTIONS
// ============================================================================

function getAuthHeader(options) {
    if (options.isCloud) {
        return `-H "Authorization: Bearer ${options.apiToken}"`;
    } else {
        return `-u "${options.username}:${options.password}"`;
    }
}

function uploadNamespaceFile(filePath, baseDir, options) {
    const { url, namespace, dryRun, isCloud } = options;

    const relativePath = path.relative(baseDir, filePath);
    const namespacePath = `scripts/${relativePath}`;
    const fileName = path.basename(filePath);

    if (dryRun) {
        console.log(`    \x1b[36m[Dry-run: would upload ${namespacePath}]\x1b[0m`);
        return { file: fileName, path: namespacePath, success: true, dryRun: true };
    }

    try {
        const authHeader = getAuthHeader(options);
        const apiPath = isCloud
            ? `${url}/api/v1/${options.tenant}/namespaces/${namespace}/files`
            : `${url}/api/v1/namespaces/${namespace}/files`;

        // Path without leading slash (Kestra 2025 best practice)
        const encodedPath = encodeURIComponent(namespacePath);
        const curlCmd = `curl -s -o /dev/null -w "%{http_code}" -X POST \
            "${apiPath}?path=${encodedPath}" \
            ${authHeader} \
            -H "Content-Type: multipart/form-data" \
            -F "fileContent=@${filePath}"`;

        const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 30000 }).trim();

        if (result === '201' || result === '200' || result === '204') {
            console.log(`    \x1b[32m✓\x1b[0m ${namespacePath}`);
            return { file: fileName, path: namespacePath, success: true };
        } else {
            console.log(`    \x1b[31m✗\x1b[0m ${namespacePath} (HTTP ${result})`);
            return { file: fileName, path: namespacePath, success: false, error: `HTTP ${result}` };
        }
    } catch (error) {
        console.log(`    \x1b[31m✗\x1b[0m ${namespacePath}: ${error.message}`);
        return { file: fileName, path: namespacePath, success: false, error: error.message };
    }
}

function uploadNamespaceFiles(scriptsDir, options) {
    const scriptFiles = findScriptFiles(scriptsDir);

    if (scriptFiles.length === 0) {
        console.log(`    (no script files found)`);
        return [];
    }

    console.log(`    Found ${scriptFiles.length} script file(s) to upload`);

    const results = scriptFiles.map(file => uploadNamespaceFile(file, scriptsDir, options));
    return results;
}

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

function checkKestraHealth(options) {
    const { url, isCloud } = options;

    try {
        const authHeader = getAuthHeader(options);
        const healthUrl = isCloud
            ? `${url}/api/v1/${options.tenant}/configs`
            : `${url}/api/v1/configs`;

        const result = execSync(
            `curl -s -o /dev/null -w "%{http_code}" ${authHeader} "${healthUrl}"`,
            { encoding: 'utf-8', timeout: 10000 }
        ).trim();

        return result === '200';
    } catch (error) {
        return false;
    }
}

function getExistingFlows(options) {
    const { url, namespace, isCloud } = options;

    try {
        const authHeader = getAuthHeader(options);
        const apiPath = isCloud
            ? `${url}/api/v1/${options.tenant}/flows/${namespace}`
            : `${url}/api/v1/flows/${namespace}`;

        const result = execSync(
            `curl -s ${authHeader} "${apiPath}"`,
            { encoding: 'utf-8', timeout: 10000 }
        );

        const flows = JSON.parse(result);
        return Array.isArray(flows) ? flows.map(f => ({ id: f.id, namespace: f.namespace })) : [];
    } catch (error) {
        return [];
    }
}

function deleteFlow(flowId, options) {
    const { url, namespace, dryRun, isCloud } = options;

    if (dryRun) {
        console.log(`    \x1b[36m[Dry-run: would delete ${namespace}/${flowId}]\x1b[0m`);
        return { flowId, success: true, dryRun: true };
    }

    try {
        const authHeader = getAuthHeader(options);
        const apiPath = isCloud
            ? `${url}/api/v1/${options.tenant}/flows/${namespace}/${flowId}`
            : `${url}/api/v1/flows/${namespace}/${flowId}`;

        const result = execSync(
            `curl -s -o /dev/null -w "%{http_code}" -X DELETE ${authHeader} "${apiPath}"`,
            { encoding: 'utf-8', timeout: 10000 }
        ).trim();

        if (result === '204' || result === '200') {
            console.log(`    \x1b[32m✓\x1b[0m Deleted ${namespace}/${flowId}`);
            return { flowId, success: true };
        } else {
            console.log(`    \x1b[31m✗\x1b[0m Failed to delete ${namespace}/${flowId} (HTTP ${result})`);
            return { flowId, success: false, error: `HTTP ${result}` };
        }
    } catch (error) {
        console.log(`    \x1b[31m✗\x1b[0m Failed to delete ${namespace}/${flowId}: ${error.message}`);
        return { flowId, success: false, error: error.message };
    }
}

function deployFlow(filePath, options) {
    const { url, namespace, dryRun, isCloud } = options;
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    const flowId = extractFlowId(content);
    const flowNamespace = extractNamespace(content) || namespace;

    if (!flowId) {
        console.log(`\n  ${fileName}`);
        console.log(`    \x1b[31m✗ ERROR: Could not extract flow ID from file\x1b[0m`);
        return { file: fileName, success: false, error: 'No flow ID found' };
    }

    console.log(`\n  ${fileName}`);
    console.log(`    Flow ID:   ${flowId}`);
    console.log(`    Namespace: ${flowNamespace}`);

    if (dryRun) {
        console.log(`    \x1b[36m[Dry-run: would deploy to ${isCloud ? 'Kestra Cloud' : 'Local Kestra'}]\x1b[0m`);
        return { file: fileName, flowId, namespace: flowNamespace, success: true, dryRun: true };
    }

    try {
        const authHeader = getAuthHeader(options);
        const apiPath = isCloud
            ? `${url}/api/v1/${options.tenant}/flows`
            : `${url}/api/v1/flows`;

        const curlCmd = `curl -s -X POST "${apiPath}" \
            ${authHeader} \
            -H "Content-Type: application/x-yaml" \
            --data-binary @"${filePath}"`;

        const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 60000 });

        let response;
        try {
            response = JSON.parse(result);
        } catch (e) {
            console.log(`    \x1b[31m✗ ERROR: Invalid response from Kestra\x1b[0m`);
            console.log(`    Response: ${result.substring(0, 200)}`);
            return { file: fileName, flowId, success: false, error: 'Invalid response' };
        }

        if (response.id === flowId) {
            const revision = response.revision || 'unknown';
            console.log(`    \x1b[32m✓ Deployed successfully (revision: ${revision})\x1b[0m`);
            return { file: fileName, flowId, namespace: flowNamespace, success: true, revision };
        } else if (response.message) {
            console.log(`    \x1b[31m✗ ERROR: ${response.message}\x1b[0m`);
            return { file: fileName, flowId, success: false, error: response.message };
        } else {
            console.log(`    \x1b[32m✓ Deployed successfully\x1b[0m`);
            return { file: fileName, flowId, namespace: flowNamespace, success: true };
        }

    } catch (error) {
        const errorMsg = error.message || 'Unknown error';
        console.log(`    \x1b[31m✗ ERROR: ${errorMsg}\x1b[0m`);
        return { file: fileName, flowId, success: false, error: errorMsg };
    }
}

// ============================================================================
// SUMMARY
// ============================================================================

function printSummary(results, options, deletedCount = 0, namespaceFileResults = [], prepResult = null) {
    const { dryRun, isCloud } = options;
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const nsSuccessful = namespaceFileResults.filter(r => r.success && !r.dryRun);
    const nsFailed = namespaceFileResults.filter(r => !r.success && !r.dryRun);

    printHeader('DEPLOYMENT SUMMARY');

    const target = isCloud ? '\x1b[35mKESTRA CLOUD\x1b[0m' : '\x1b[32mLOCAL KESTRA\x1b[0m';

    console.log(`
  Target:          ${target}
  Namespace files: ${nsSuccessful.length > 0 ? `\x1b[32m${nsSuccessful.length} uploaded\x1b[0m` : '0 uploaded'}${nsFailed.length > 0 ? `, \x1b[31m${nsFailed.length} failed\x1b[0m` : ''}
  Deleted flows:   ${deletedCount}
  Deployed flows:  ${results.length}
  Successful:      \x1b[32m${successful.length}\x1b[0m
  Failed:          ${failed.length > 0 ? `\x1b[31m${failed.length}\x1b[0m` : '0'}
  Mode:            ${dryRun ? '\x1b[36mDRY-RUN (no changes made)\x1b[0m' : '\x1b[32mLIVE\x1b[0m'}
`);

    if (prepResult && prepResult.secrets.length > 0 && isCloud) {
        printSubHeader('Required Cloud Secrets Reminder');
        console.log(`\n  Make sure these secrets exist in Kestra Cloud:`);
        prepResult.secrets.forEach(s => {
            console.log(`    • ${s}`);
        });
        console.log('');
    }

    if (successful.length > 0 && !dryRun) {
        printSubHeader('Deployed Flows');
        successful.forEach(r => {
            console.log(`    \x1b[32m✓\x1b[0m ${r.namespace}/${r.flowId} (rev: ${r.revision || 'n/a'})`);
        });
    }

    if (failed.length > 0) {
        printSubHeader('Failed Deployments');
        failed.forEach(r => {
            console.log(`    \x1b[31m✗\x1b[0m ${r.file}: ${r.error}`);
        });
    }

    console.log('');
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

function showHelp() {
    console.log(`
Kestra Flow Deployment Script (Interactive)
============================================

Supports deployment to both LOCAL Kestra (Docker) and KESTRA CLOUD.

Usage:
  node deploy-flows.js [options]

Options:
  --local          Deploy to local Kestra (skip interactive prompt)
  --cloud          Deploy to Kestra Cloud (skip interactive prompt)
  --dry-run        Preview what would be deployed without making changes
  --namespace NAME Override the default namespace (default: ai_concierge)
  --help           Show this help message

Environment Variables:
  LOCAL:
    KESTRA_LOCAL_URL       - Local Kestra URL (default: http://localhost:8082)
    KESTRA_LOCAL_USERNAME  - Basic auth username
    KESTRA_LOCAL_PASSWORD  - Basic auth password

  CLOUD:
    KESTRA_CLOUD_URL       - Kestra Cloud URL
    KESTRA_CLOUD_TENANT    - Kestra Cloud tenant (default: main)
    KESTRA_API_TOKEN       - Kestra Cloud API token

  SHARED:
    KESTRA_NAMESPACE       - Default namespace (default: ai_concierge)

Examples:
  node deploy-flows.js              # Interactive mode
  node deploy-flows.js --local      # Deploy to local Kestra
  node deploy-flows.js --cloud      # Deploy to Kestra Cloud
  node deploy-flows.js --dry-run    # Preview deployment
`);
}

function parseArgs(args) {
    const options = {
        dryRun: false,
        forceLocal: false,
        forceCloud: false,
        namespace: CONFIG.namespace,
        showHelp: false,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--help' || arg === '-h') {
            options.showHelp = true;
        } else if (arg === '--local' || arg === '-l') {
            options.forceLocal = true;
        } else if (arg === '--cloud' || arg === '-c') {
            options.forceCloud = true;
        } else if (arg === '--namespace' && args[i + 1]) {
            options.namespace = args[++i];
        }
    }

    return options;
}

async function selectDeploymentTarget(options) {
    // If forced via CLI, skip prompt
    if (options.forceLocal) return 'local';
    if (options.forceCloud) return 'cloud';

    // Interactive selection
    printBox([
        'KESTRA DEPLOYMENT TARGET',
        '',
        'Where do you want to deploy?',
        '',
        '[L] Local Kestra (Docker - localhost:8082)',
        '[C] Kestra Cloud (Production)',
        '',
        'Enter L or C:',
    ], '\x1b[36m');

    const answer = await promptUser('\n  Your choice: ');

    if (answer === 'l' || answer === 'local') {
        return 'local';
    } else if (answer === 'c' || answer === 'cloud') {
        return 'cloud';
    } else {
        console.log(`\n  \x1b[31mInvalid choice. Please enter L or C.\x1b[0m\n`);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    const cliOptions = parseArgs(args);

    if (cliOptions.showHelp) {
        showHelp();
        process.exit(0);
    }

    // Print header
    printHeader('KESTRA FLOW DEPLOYMENT');

    // Select deployment target
    const target = await selectDeploymentTarget(cliOptions);
    const isCloud = target === 'cloud';

    // Build options based on target
    const options = {
        dryRun: cliOptions.dryRun,
        namespace: cliOptions.namespace,
        isCloud,
        ...(isCloud ? {
            url: CONFIG.cloud.url,
            apiToken: CONFIG.cloud.apiToken,
            tenant: CONFIG.cloud.tenant,
        } : {
            url: CONFIG.local.url,
            username: CONFIG.local.username,
            password: CONFIG.local.password,
        }),
    };

    // Validate Cloud configuration
    if (isCloud) {
        if (!options.url) {
            console.error(`\n  \x1b[31mERROR: KESTRA_CLOUD_URL not set\x1b[0m`);
            console.error(`  Set the environment variable or check your .env file\n`);
            process.exit(1);
        }
        if (!options.apiToken) {
            console.error(`\n  \x1b[31mERROR: KESTRA_API_TOKEN not set\x1b[0m`);
            console.error(`  Set the environment variable or check your .env file\n`);
            process.exit(1);
        }
    }

    // Determine source directory
    // In Cloud dry-run, files aren't actually copied to prod_flows, so use flows/ for preview
    const sourceDir = isCloud && !cliOptions.dryRun ? PROD_FLOWS_DIR : FLOWS_DIR;

    console.log(`
  Target:    ${isCloud ? '\x1b[35mKestra Cloud\x1b[0m' : '\x1b[32mLocal Kestra\x1b[0m'}
  URL:       ${options.url}
  Namespace: ${options.namespace}
  Mode:      ${options.dryRun ? '\x1b[36mDRY-RUN\x1b[0m' : '\x1b[32mLIVE\x1b[0m'}
`);

    // For Cloud deployment, prepare prod_flows
    let prepResult = null;
    if (isCloud) {
        prepResult = prepareProdFlows(options.dryRun);

        if (!options.dryRun && prepResult.secrets.length > 0) {
            console.log(`\n  \x1b[33m⚠ IMPORTANT: Ensure secrets are configured in Kestra Cloud before continuing.\x1b[0m`);
            const proceed = await promptUser('\n  Continue with deployment? (y/n): ');
            if (proceed !== 'y' && proceed !== 'yes') {
                console.log(`\n  Deployment cancelled.\n`);
                process.exit(0);
            }
        }
    }

    // Check Kestra health (skip in dry-run)
    if (!options.dryRun) {
        printSubHeader('Checking Kestra connectivity');

        const healthy = checkKestraHealth(options);
        if (!healthy) {
            console.error(`\n  \x1b[31mERROR: Cannot connect to Kestra at ${options.url}\x1b[0m`);
            if (isCloud) {
                console.error(`  Check your KESTRA_CLOUD_URL and KESTRA_API_TOKEN\n`);
            } else {
                console.error(`  Make sure Kestra is running: docker-compose up -d kestra\n`);
            }
            process.exit(1);
        }
        console.log(`    \x1b[32m✓\x1b[0m Connected to Kestra at ${options.url}`);
    }

    // Copy compiled TypeScript configs to scripts/ (required for Kestra Cloud)
    printSubHeader('Copying compiled assistant configs');
    const configResult = copyCompiledConfigs(options.dryRun);

    if (configResult.needsBuild) {
        console.error(`\n  \x1b[31mERROR: TypeScript not compiled. Run: pnpm --filter api build\x1b[0m`);
        console.error(`  Missing directory: ${API_DIST_VAPI_DIR}\n`);
        process.exit(1);
    }

    if (configResult.missing.length > 0) {
        console.log(`  \x1b[33m⚠ Missing configs (may need rebuild):\x1b[0m`);
        configResult.missing.forEach(f => console.log(`    - ${f}`));
    }

    if (configResult.errors.length > 0) {
        console.error(`  \x1b[31mErrors:\x1b[0m`);
        configResult.errors.forEach(e => console.error(`    - ${e}`));
    }

    if (configResult.copied.length > 0) {
        if (options.dryRun) {
            console.log(`    \x1b[36m[Dry-run: would copy ${configResult.copied.length} config file(s)]\x1b[0m`);
            configResult.copied.forEach(c => console.log(`      - ${c.file}`));
        } else {
            console.log(`    \x1b[32m✓\x1b[0m Copied ${configResult.copied.length} config file(s)`);
            configResult.copied.forEach(c => console.log(`      - ${c.file}`));
        }
    }

    // Upload namespace files (scripts + configs)
    printSubHeader(`Uploading namespace files to ${options.namespace}`);
    const namespaceFileResults = uploadNamespaceFiles(SCRIPTS_DIR, options);
    const failedUploads = namespaceFileResults.filter(r => !r.success && !r.dryRun);
    if (failedUploads.length > 0) {
        console.error(`\n  \x1b[33mWARNING: ${failedUploads.length} file(s) failed to upload\x1b[0m`);
    } else if (namespaceFileResults.length > 0) {
        const uploadCount = namespaceFileResults.filter(r => r.success).length;
        console.log(`    Uploaded ${uploadCount} namespace file(s)`);
    }

    // Find YAML files
    const yamlFiles = findYamlFiles(sourceDir);

    if (yamlFiles.length === 0) {
        console.error(`\n  \x1b[31mERROR: No .yaml or .yml files found in ${sourceDir}\x1b[0m\n`);
        process.exit(1);
    }

    // Delete existing flows in the namespace
    printSubHeader(`Cleaning existing flows in ${options.namespace}`);

    const existingFlows = options.dryRun ? [] : getExistingFlows(options);

    if (existingFlows.length === 0 && !options.dryRun) {
        console.log(`    (no existing flows found)`);
    } else if (options.dryRun) {
        console.log(`    \x1b[36m[Dry-run: would delete all existing flows in ${options.namespace}]\x1b[0m`);
    } else {
        existingFlows.forEach(flow => {
            deleteFlow(flow.id, options);
        });
        console.log(`    Deleted ${existingFlows.length} existing flow(s)`);
    }

    printSubHeader(`Deploying ${yamlFiles.length} flow(s)`);

    // Deploy each flow
    const results = yamlFiles.map(file => deployFlow(file, options));

    // Print summary
    printSummary(results, options, existingFlows.length, namespaceFileResults, prepResult);

    // Exit with error code if any deployments failed
    const failed = results.filter(r => !r.success);
    if (failed.length > 0 && !options.dryRun) {
        process.exit(1);
    }

    if (options.dryRun) {
        console.log(`  \x1b[36mRun without --dry-run to deploy flows.\x1b[0m\n`);
    }
}

// Run
main().catch(err => {
    console.error(`\n  \x1b[31mFatal error: ${err.message}\x1b[0m\n`);
    process.exit(1);
});
