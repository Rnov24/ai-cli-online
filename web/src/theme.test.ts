import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Theme token consistency and regression test', () => {
  const cssPath = path.resolve(__dirname, 'index.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  function extractVarsFromBlock(block: string): Set<string> {
    const matches = [...block.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)];
    return new Set(matches.map((m) => m[1]));
  }

  const darkMatch = cssContent.match(/:root\s*,\s*\[data-theme="dark"\]\s*\{([^}]+)\}/);
  const lightMatch = cssContent.match(/\[data-theme="light"\]\s*\{([^}]+)\}/);

  const darkVars = darkMatch ? extractVarsFromBlock(darkMatch[1]) : new Set<string>();
  const lightVars = lightMatch ? extractVarsFromBlock(lightMatch[1]) : new Set<string>();

  it('declares identical custom properties in both dark and light themes', () => {
    expect(darkVars.size).toBeGreaterThan(0);
    expect(lightVars.size).toBeGreaterThan(0);

    const inDarkNotLight = [...darkVars].filter((v) => !lightVars.has(v));
    const inLightNotDark = [...lightVars].filter((v) => !darkVars.has(v));

    expect(inDarkNotLight).toEqual([]);
    expect(inLightNotDark).toEqual([]);
  });

  it('declares all semantic card and surface alias variables in both themes', () => {
    const requiredAliases = [
      '--bg-card',
      '--border-color',
      '--bg-surface',
      '--bg-input',
      '--border-hover',
      '--btn-contrast-text',
      '--badge-overlay-bg',
    ];

    for (const alias of requiredAliases) {
      expect(darkVars.has(alias), `Missing ${alias} in dark theme`).toBe(true);
      expect(lightVars.has(alias), `Missing ${alias} in light theme`).toBe(true);
    }
  });

  it('verifies that no component under web/src/components references undefined CSS tokens', () => {
    const allCssDeclaredVars = new Set(
      [...cssContent.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1])
    );

    const compDir = path.resolve(__dirname, 'components');
    const compFiles: string[] = [];

    function findFiles(dir: string) {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findFiles(fullPath);
        } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
          compFiles.push(fullPath);
        }
      }
    }

    findFiles(compDir);
    expect(compFiles.length).toBeGreaterThan(0);

    const undefinedVars: Array<{ file: string; token: string }> = [];

    for (const file of compFiles) {
      const fileContent = fs.readFileSync(file, 'utf8');
      const matches = [...fileContent.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)];
      for (const match of matches) {
        const token = match[1];
        if (!allCssDeclaredVars.has(token)) {
          undefinedVars.push({
            file: path.relative(__dirname, file),
            token,
          });
        }
      }
    }

    expect(undefinedVars).toEqual([]);
  });
});
