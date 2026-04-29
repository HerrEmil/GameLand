#!/usr/bin/env node
import { rm, mkdir, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const root = process.cwd();
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const items = ['index.html', 'scripts', 'styles', 'fonts', 'images'];
for (const item of items) {
	const src = join(root, item);
	if (!existsSync(src)) continue;
	await cp(src, join(dist, item), { recursive: true });
}

// Run perf-config hash-assets if present (perf gate provides it under .perf-config/).
const hashTool = join(root, '.perf-config/tools/hash-assets.mjs');
if (existsSync(hashTool)) {
	const r = spawnSync('node', [hashTool, dist], { stdio: 'inherit' });
	if (r.status !== 0) process.exit(r.status ?? 1);
} else {
	console.log('build: hash-assets tool not found (skipping; perf-gate context only).');
}

console.log('build: copied site to dist/');
