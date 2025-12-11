#!/usr/bin/env node
/**
 * Kestra Cloud Migration Script
 *
 * Transforms {{ envs.KEY }} to {{ secret('KEY') }} in Kestra workflow files
 * for compatibility with Kestra Cloud's secrets management.
 *
 * Usage:
 *   node migrate-envs-to-secrets.js [options] [directory]
 *
 * Options:
 *   --dry-run     Preview changes without writing files
 *   --no-backup   Skip creating .bak backup files
 *   --help        Show this help message
 *
 * Examples:
 *   node migrate-envs-to-secrets.js                          # Process ../prod_flows
 *   node migrate-envs-to-secrets.js --dry-run                # Preview only
 *   node migrate-envs-to-secrets.js /path/to/flows           # Custom directory
 *   node migrate-envs-to-secrets.js --no-backup ../prod_flows
 */

const fs = require('fs');
const path = require('path');

// ============================================================================
// CONFIGURATION
// ============================================================================

const PATTERN = /\{\{\s*envs\.(\w+)\s*\}\}/g;
const EXTENSIONS = ['.yaml', '.yml'];
const DEFAULT_DIR = path.join(__dirname, '..', 'prod_flows');

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
            files.push(...findYamlFiles(fullPath));
        } else if (entry.isFile() && EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
            files.push(fullPath);
        }
    }

    return files;
}

function findEnvVarsWithLines(content) {
    const results = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
        let match;
        const linePattern = /\{\{\s*envs\.(\w+)\s*\}\}/g;

        while ((match = linePattern.exec(line)) !== null) {
            results.push({
                varName: match[1],
                lineNumber: index + 1,
                lineContent: line.trim(),
                fullMatch: match[0]
            });
        }
    });

    return results;
}

function transformContent(content) {
    return content.replace(PATTERN, "{{ secret('$1') }}");
}

// ============================================================================
// MAIN PROCESSING
// ============================================================================

function processFile(filePath, options) {
    const { dryRun, noBackup } = options;
    const content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);

    // Find all env vars before transformation
    const envVars = findEnvVarsWithLines(content);

    if (envVars.length === 0) {
        console.log(`\n  ${fileName}`);
        console.log(`    (no envs references found)`);
        return { file: fileName, replacements: [], skipped: true };
    }

    // Transform content
    const newContent = transformContent(content);

    // Display results
    console.log(`\n  ${fileName}`);

    envVars.forEach(({ varName, lineNumber }) => {
        console.log(`    \x1b[32m✓\x1b[0m Line ${lineNumber}: envs.${varName} → secret('${varName}')`);
    });

    if (!dryRun) {
        // Create backup
        if (!noBackup) {
            const backupPath = filePath + '.bak';
            fs.writeFileSync(backupPath, content, 'utf-8');
            console.log(`    \x1b[33m[Backup: ${fileName}.bak]\x1b[0m`);
        }

        // Write transformed content
        fs.writeFileSync(filePath, newContent, 'utf-8');
        console.log(`    \x1b[32m[Updated]\x1b[0m`);
    } else {
        console.log(`    \x1b[36m[Dry-run: no changes written]\x1b[0m`);
    }

    return {
        file: fileName,
        filePath,
        replacements: envVars,
        skipped: false
    };
}

function generateSecretsReport(results) {
    // Collect all unique secret names
    const secretsMap = new Map();

    results.forEach(result => {
        if (!result.skipped) {
            result.replacements.forEach(({ varName }) => {
                if (!secretsMap.has(varName)) {
                    secretsMap.set(varName, []);
                }
                secretsMap.get(varName).push({
                    file: result.file,
                    line: result.replacements.find(r => r.varName === varName)?.lineNumber
                });
            });
        }
    });

    return secretsMap;
}

function printSecretsReport(secretsMap, dryRun) {
    printHeader('KESTRA CLOUD SECRETS REQUIRED');

    console.log(`
  The following secrets must be added to your Kestra Cloud namespace:

  \x1b[33mNamespace Settings → Secrets → Add Secret\x1b[0m
`);

    const secrets = Array.from(secretsMap.keys()).sort();

    // Table header
    console.log('  ┌─────────────────────────────┬────────────────────────────────────────┐');
    console.log('  │ Secret Name                 │ Used In                                │');
    console.log('  ├─────────────────────────────┼────────────────────────────────────────┤');

    secrets.forEach(secretName => {
        const usages = secretsMap.get(secretName);
        const files = [...new Set(usages.map(u => u.file))].join(', ');
        const secretCol = secretName.padEnd(27);
        const filesCol = files.length > 38 ? files.substring(0, 35) + '...' : files.padEnd(38);
        console.log(`  │ ${secretCol} │ ${filesCol} │`);
    });

    console.log('  └─────────────────────────────┴────────────────────────────────────────┘');

    // Environment variable mapping hint
    printSubHeader('Environment Variable Mapping');

    console.log(`
  Add these secrets in Kestra Cloud with values from your local .env:
`);

    secrets.forEach(secretName => {
        // Map common lowercase kestra names to uppercase env var names
        const envName = secretName.toUpperCase();
        console.log(`    ${secretName}  ←  \$${envName}`);
    });

    // Checklist
    printSubHeader('Migration Checklist');

    console.log(`
  [ ] 1. Log in to Kestra Cloud
  [ ] 2. Navigate to your namespace (ai_concierge)
  [ ] 3. Go to Secrets tab
  [ ] 4. Add each secret listed above with its value
  [ ] 5. Commit and push the updated workflow files
  [ ] 6. Verify Git Sync pulls the changes
  [ ] 7. Test a workflow execution
`);
}

function printSummary(results, dryRun) {
    const totalFiles = results.length;
    const modifiedFiles = results.filter(r => !r.skipped).length;
    const totalReplacements = results.reduce((sum, r) => sum + r.replacements.length, 0);

    printHeader('MIGRATION SUMMARY');

    console.log(`
  Files scanned:      ${totalFiles}
  Files modified:     ${modifiedFiles}
  Total replacements: ${totalReplacements}
  Mode:               ${dryRun ? '\x1b[36mDRY-RUN (no files changed)\x1b[0m' : '\x1b[32mLIVE\x1b[0m'}
`);
}

// ============================================================================
// CLI ENTRY POINT
// ============================================================================

function showHelp() {
    console.log(`
Kestra Cloud Migration Script
=============================

Transforms {{ envs.KEY }} to {{ secret('KEY') }} in Kestra workflow files.

Usage:
  node migrate-envs-to-secrets.js [options] [directory]

Options:
  --dry-run     Preview changes without writing files
  --no-backup   Skip creating .bak backup files
  --help        Show this help message

Examples:
  node migrate-envs-to-secrets.js                          # Process ../prod_flows
  node migrate-envs-to-secrets.js --dry-run                # Preview only
  node migrate-envs-to-secrets.js /path/to/flows           # Custom directory
  node migrate-envs-to-secrets.js --no-backup ../prod_flows

After running:
  1. Review the Secrets Report for required Kestra Cloud secrets
  2. Add secrets in Kestra Cloud: Namespace → Secrets → Add
  3. Commit and push the updated workflow files
  4. Verify Git Sync in Kestra Cloud
`);
}

function main() {
    const args = process.argv.slice(2);

    // Parse options
    const dryRun = args.includes('--dry-run');
    const noBackup = args.includes('--no-backup');
    const showHelpFlag = args.includes('--help') || args.includes('-h');

    if (showHelpFlag) {
        showHelp();
        process.exit(0);
    }

    // Find directory argument (non-flag argument)
    const dirArg = args.find(arg => !arg.startsWith('--'));
    const targetDir = dirArg ? path.resolve(dirArg) : DEFAULT_DIR;

    // Print header
    printHeader('KESTRA CLOUD MIGRATION: envs → secret()');

    console.log(`
  Pattern:   {{ envs.KEY }} → {{ secret('KEY') }}
  Directory: ${targetDir}
  Mode:      ${dryRun ? '\x1b[36mDRY-RUN\x1b[0m' : '\x1b[32mLIVE\x1b[0m'}
  Backups:   ${noBackup ? '\x1b[33mDISABLED\x1b[0m' : '\x1b[32mENABLED\x1b[0m'}
`);

    // Check if directory exists and has files
    if (!fs.existsSync(targetDir)) {
        console.error(`\n  \x1b[31mERROR: Directory not found: ${targetDir}\x1b[0m`);
        console.error(`\n  Please ensure you have exported your Kestra flows to the prod_flows directory.`);
        console.error(`  Expected location: kestra/prod_flows/\n`);
        process.exit(1);
    }

    // Find YAML files
    const yamlFiles = findYamlFiles(targetDir);

    if (yamlFiles.length === 0) {
        console.error(`\n  \x1b[31mERROR: No .yaml or .yml files found in ${targetDir}\x1b[0m`);
        console.error(`\n  Please export your Kestra workflows first:`);
        console.error(`    1. Open Kestra UI`);
        console.error(`    2. Navigate to your flows`);
        console.error(`    3. Export each flow as YAML`);
        console.error(`    4. Save them to: kestra/prod_flows/\n`);
        process.exit(1);
    }

    printSubHeader(`Processing ${yamlFiles.length} file(s)`);

    // Process each file
    const results = yamlFiles.map(file => processFile(file, { dryRun, noBackup }));

    // Generate and print secrets report
    const secretsMap = generateSecretsReport(results);

    if (secretsMap.size > 0) {
        printSecretsReport(secretsMap, dryRun);
    }

    // Print summary
    printSummary(results, dryRun);

    if (dryRun) {
        console.log(`  \x1b[36mRun without --dry-run to apply changes.\x1b[0m\n`);
    } else {
        console.log(`  \x1b[32mMigration complete! Don't forget to add secrets to Kestra Cloud.\x1b[0m\n`);
    }
}

// Run
main();
