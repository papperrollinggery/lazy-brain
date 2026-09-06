#!/usr/bin/env node

// Compatibility shim for existing registrations. Native skill discovery replaces
// automatic prompt interception; do not read prompts, inject instructions, or write.
process.stdout.write('{"continue":true}\n');
