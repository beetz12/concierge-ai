#!/usr/bin/env node
/**
 * Kestra Flow Deployment Script
 *
 * Uploads all local Kestra workflow YAML files to the local Kestra instance
 * using the REST API.
 *
 * Usage:
 *   node deploy-flows.js [options] [directory]
 *
 * Options:
 *   --dry-run     Preview what would be deployed without making changes
 *   --namespace   Override the default namespace (default: ai_concierge)
 *   --url         Override Kestra URL (default: http://localhost:8082)
 *   --help        Show this help message
 *
 * Examples:
 *   node deploy-flows.js                              # Deploy all flows from ../flows
 *   node deploy-flows.js --dry-run                    # Preview only
 *   node deploy-flows.js /path/to/flows               # Custom directory
 *   node deploy-flows.js --namespace my_namespace     # Different namespace
 *
 * Environment Variables:
 *   KESTRA_LOCAL_URL       - Kestra API URL (default: http://localhost:8082)
 *   KESTRA_LOCAL_USERNAME  - Basic auth username (default: admin@kestra.local)
 *   KESTRA_LOCAL_PASSWORD  - Basic auth password (default: Admin123456)
 *   KESTRA_NAMESPACE       - Default namespace (default: ai_concierge)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================================
// CONFIGURATION
// ============================================================================

const EXTENSIONS = ['.yaml', '.yml'];
const DEFAULT_DIR = path.join(__dirname, '..', 'flows');

const CONFIG = {
    url: process.env.KESTRA_LOCAL_URL || 'http://localhost:8082',
    username: process.env.KESTRA_LOCAL_USERNAME || 'admin@kestra.local',
    password: process.env.KESTRA_LOCAL_PASSWORD || 'Admin123456',
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

function findYamlFiles(dir) {
    const files = [];

    if (!fs.existsSync(dir)) {
        console.error(`\n  ERROR: Directory not found: ${dir}`);
        process.exit(1);
    }

    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
            // Skip node_modules and hidden directories
            if (!entry.name.startsWith('.') && entry.name !== 'node_modules') {
                files.push(...findYamlFiles(fullPath));
            }
        } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
            // Skip backup files
            if (!entry.name.endsWith('.bak')) {
                files.push(fullPath);
            }
        }
    }

    return files;
}

function extractFlowId(content) {
    // Extract the flow ID from the YAML content
    const match = content.match(/^id:\s*(\S+)/m);
    return match ? match[1] : null;
}

function extractNamespace(content) {
    // Extract the namespace from the YAML content
    const match = content.match(/^namespace:\s*(\S+)/m);
    return match ? match[1] : null;
}

// ============================================================================
// DEPLOYMENT FUNCTIONS
// ============================================================================

function checkKestraHealth(options) {
    const { url, username, password } = options;

    try {
        const result = execSync(
            `curl -s -o /dev/null -w "%{http_code}" -u "${username}:${password}" "${url}/api/v1/configs"`,
            { encoding: 'utf-8', timeout: 5000 }
        ).trim();

        return result === '200';
    } catch (error) {
        return false;
    }
}

function getExistingFlows(options) {
    const { url, username, password, namespace } = options;

    try {
        const result = execSync(
            `curl -s -u "${username}:${password}" "${url}/api/v1/flows/${namespace}"`,
            { encoding: 'utf-8', timeout: 10000 }
        );

        const flows = JSON.parse(result);
        return Array.isArray(flows) ? flows.map(f => ({ id: f.id, namespace: f.namespace })) : [];
    } catch (error) {
        return [];
    }
}

function deleteFlow(flowId, options) {
    const { url, username, password, namespace, dryRun } = options;

    if (dryRun) {
        console.log(`    \x1b[36m[Dry-run: would delete ${namespace}/${flowId}]\x1b[0m`);
        return { flowId, success: true, dryRun: true };
    }

    try {
        const result = execSync(
            `curl -s -o /dev/null -w "%{http_code}" -X DELETE -u "${username}:${password}" "${url}/api/v1/flows/${namespace}/${flowId}"`,
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
    const { url, username, password, namespace, dryRun } = options;
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Extract flow ID and namespace from YAML
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
        console.log(`    \x1b[36m[Dry-run: would deploy to ${url}/api/v1/flows/${flowNamespace}/${flowId}]\x1b[0m`);
        return { file: fileName, flowId, namespace: flowNamespace, success: true, dryRun: true };
    }

    try {
        // Use POST to create a new flow (works for both create and update in Kestra)
        // POST /api/v1/flows creates or updates a flow based on the YAML content
        const curlCmd = `curl -s -X POST "${url}/api/v1/flows" \
            -u "${username}:${password}" \
            -H "Content-Type: application/x-yaml" \
            --data-binary @"${filePath}"`;

        const result = execSync(curlCmd, { encoding: 'utf-8', timeout: 60000 });

        // Parse response to check for errors
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

function printSummary(results, dryRun, deletedCount = 0) {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    printHeader('DEPLOYMENT SUMMARY');

    console.log(`
  Deleted flows:   ${deletedCount}
  Deployed flows:  ${results.length}
  Successful:      \x1b[32m${successful.length}\x1b[0m
  Failed:          ${failed.length > 0 ? `\x1b[31m${failed.length}\x1b[0m` : '0'}
  Mode:            ${dryRun ? '\x1b[36mDRY-RUN (no changes made)\x1b[0m' : '\x1b[32mLIVE\x1b[0m'}
`);

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
Kestra Flow Deployment Script
=============================

Uploads all local Kestra workflow YAML files to the local Kestra instance.

Usage:
  node deploy-flows.js [options] [directory]

Options:
  --dry-run          Preview what would be deployed without making changes
  --namespace NAME   Override the default namespace (default: ai_concierge)
  --url URL          Override Kestra URL (default: http://localhost:8082)
  --help             Show this help message

Examples:
  node deploy-flows.js                              # Deploy all flows from ../flows
  node deploy-flows.js --dry-run                    # Preview only
  node deploy-flows.js /path/to/flows               # Custom directory
  node deploy-flows.js --namespace my_namespace     # Different namespace

Environment Variables:
  KESTRA_LOCAL_URL       - Kestra API URL
  KESTRA_LOCAL_USERNAME  - Basic auth username
  KESTRA_LOCAL_PASSWORD  - Basic auth password
  KESTRA_NAMESPACE       - Default namespace
`);
}

function parseArgs(args) {
    const options = {
        dryRun: false,
        namespace: CONFIG.namespace,
        url: CONFIG.url,
        username: CONFIG.username,
        password: CONFIG.password,
        showHelp: false,
        targetDir: DEFAULT_DIR,
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];

        if (arg === '--dry-run') {
            options.dryRun = true;
        } else if (arg === '--help' || arg === '-h') {
            options.showHelp = true;
        } else if (arg === '--namespace' && args[i + 1]) {
            options.namespace = args[++i];
        } else if (arg === '--url' && args[i + 1]) {
            options.url = args[++i];
        } else if (!arg.startsWith('--')) {
            options.targetDir = path.resolve(arg);
        }
    }

    return options;
}

function main() {
    const args = process.argv.slice(2);
    const options = parseArgs(args);

    if (options.showHelp) {
        showHelp();
        process.exit(0);
    }

    // Print header
    printHeader('KESTRA FLOW DEPLOYMENT');

    console.log(`
  Target:    ${options.targetDir}
  Kestra:    ${options.url}
  Namespace: ${options.namespace}
  Mode:      ${options.dryRun ? '\x1b[36mDRY-RUN\x1b[0m' : '\x1b[32mLIVE\x1b[0m'}
`);

    // Check if directory exists
    if (!fs.existsSync(options.targetDir)) {
        console.error(`\n  \x1b[31mERROR: Directory not found: ${options.targetDir}\x1b[0m`);
        process.exit(1);
    }

    // Check Kestra health (skip in dry-run)
    if (!options.dryRun) {
        printSubHeader('Checking Kestra connectivity');

        const healthy = checkKestraHealth(options);
        if (!healthy) {
            console.error(`\n  \x1b[31mERROR: Cannot connect to Kestra at ${options.url}\x1b[0m`);
            console.error(`  Make sure Kestra is running: docker-compose up -d kestra\n`);
            process.exit(1);
        }
        console.log(`    \x1b[32m✓\x1b[0m Connected to Kestra at ${options.url}`);
    }

    // Find YAML files
    const yamlFiles = findYamlFiles(options.targetDir);

    if (yamlFiles.length === 0) {
        console.error(`\n  \x1b[31mERROR: No .yaml or .yml files found in ${options.targetDir}\x1b[0m\n`);
        process.exit(1);
    }

    // Get list of flow IDs we're about to deploy
    const localFlowIds = yamlFiles.map(file => {
        const content = fs.readFileSync(file, 'utf-8');
        return extractFlowId(content);
    }).filter(Boolean);

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
    printSummary(results, options.dryRun, existingFlows.length);

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
main();
