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
await Promise.all(
	items.map((item) => cp(join(root, item), join(dist, item), { recursive: true }))
);

// Hash assets with the shared perf-config tool: CI checks it out under
// .perf-config/, local dev uses the sibling clone.
const hashTool = ['.perf-config', '../perf-config']
	.map((dir) => join(root, dir, 'tools/hash-assets.mjs'))
	.find((path) => existsSync(path));
if (hashTool) {
	const r = spawnSync('node', [hashTool, dist], { stdio: 'inherit' });
	if (r.status !== 0) process.exit(r.status ?? 1);
} else {
	console.log('build: hash-assets tool not found (skipping; dist will be unhashed).');
}

console.log('build: copied site to dist/');
