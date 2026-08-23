const fs = require('fs');
const path = require('path');

const routesContent = fs.readFileSync('d:/Mujahid/LMS/server/features/frappe-compat/routes.js', 'utf8');

const activeRoutes = [];
const lines = routesContent.split('\n');
for (const l of lines) {
  const m = l.match(/router\.all\(['"]([^'"]+)['"]/);
  if (m) activeRoutes.push(m[1]);
}

let inStubs = false;
const stubs = [];
for (const l of lines) {
  if (l.includes('const STUBS = {')) inStubs = true;
  if (inStubs) {
    const sm = l.match(/['"]([^'"]+)['"]:/);
    if (sm) stubs.push(sm[1]);
    if (l.includes('};')) inStubs = false;
  }
}

console.log('=== ROUTE ANALYSIS ===');
console.log('Active Handlers Count:', activeRoutes.length);
console.log('Active Handlers List:', activeRoutes);
console.log('\nStubbed Endpoints Count:', stubs.length);
console.log('Stubbed Endpoints List:', stubs);

const feContent = fs.readFileSync('d:/Mujahid/LMS/frontend/src/routes.js', 'utf8');
const feMatches = [];
for (const l of feContent.split('\n')) {
  const m = l.match(/path:\s*['"]([^'"]+)['"]/);
  if (m) feMatches.push(m[1]);
}

console.log('\nFrontend Registered Page Routes Count:', feMatches.length);
console.log('Unique Frontend Paths:', [...new Set(feMatches)]);
