import { describe, it, expect } from 'vitest';
import { generateAnnotateCommand, deriveModulePath, shellQuote } from './annotationHelpers';

describe('annotationHelpers', () => {
  it('shellQuote handles safe and unsafe paths', () => {
    expect(shellQuote('AiTasks/my-task/.plan.md')).toBe('AiTasks/my-task/.plan.md');
    expect(shellQuote('AiTasks/my task/.plan.md')).toBe("'AiTasks/my task/.plan.md'");
    expect(shellQuote("path'with'quote")).toBe("'path'\\''with'\\''quote'");
  });

  it('generateAnnotateCommand generates /annotate command with silent flag', () => {
    const cmd = generateAnnotateCommand('AiTasks/task-1/.plan.md', 'AiTasks/task-1/.tmp-annotations.json');
    expect(cmd).toBe('/annotate AiTasks/task-1/.plan.md AiTasks/task-1/.tmp-annotations.json --silent');
  });

  it('deriveModulePath correctly derives task module root', () => {
    expect(deriveModulePath('/home/user/repo/AiTasks/feature-auth/.plan.md')).toBe('/home/user/repo/AiTasks/feature-auth');
    expect(deriveModulePath('AiTasks/feature-auth/.target.md')).toBe('AiTasks/feature-auth');
  });
});
