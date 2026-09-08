import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SkillsManagementModal } from './SkillsManagementModal';
import { fetchSkills, fetchSkillContent, scaffoldSkill, type SkillItem } from '../api/skills';

vi.mock('../api/skills', () => ({
  fetchSkills: vi.fn(),
  fetchSkillContent: vi.fn(),
  scaffoldSkill: vi.fn(),
}));

const mockFetchSkills = vi.mocked(fetchSkills);
const mockFetchSkillContent = vi.mocked(fetchSkillContent);
const mockScaffoldSkill = vi.mocked(scaffoldSkill);

const mockSkills: SkillItem[] = [
  {
    name: 'deploy-staging',
    description: 'Deploy branch to staging environment',
    scope: 'workspace',
    path: '/work/proj/.agents/skills/deploy-staging',
    skillFile: '/work/proj/.agents/skills/deploy-staging/SKILL.md',
    hasScripts: true,
    hasResources: false,
  },
  {
    name: 'verify',
    description: 'Run domain-adapted verification test suite',
    scope: 'global',
    path: '/home/.gemini/config/plugins/ai-cli-task/skills/verify',
    skillFile: '/home/.gemini/config/plugins/ai-cli-task/skills/verify/SKILL.md',
    hasScripts: false,
    hasResources: false,
  },
  {
    name: 'antigravity-guide',
    description: 'Quick reference and sitemap for AGY',
    scope: 'builtin',
    path: '/home/.gemini/antigravity-cli/builtin/skills/antigravity_guide',
    skillFile: '/home/.gemini/antigravity-cli/builtin/skills/antigravity_guide/SKILL.md',
    hasScripts: false,
    hasResources: true,
  },
];

describe('SkillsManagementModal', { timeout: 20000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSkills.mockResolvedValue({
      workspacePath: '/work/proj',
      isHome: false,
      skills: mockSkills,
      count: 3,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('does not render when isOpen is false', () => {
    render(
      <SkillsManagementModal
        isOpen={false}
        onClose={vi.fn()}
        token="test-token"
      />
    );
    expect(screen.queryByText(/SKILLS & CAPABILITIES HUB/i)).not.toBeInTheDocument();
  });

  it('renders skills, scope badges, and counts when opened', async () => {
    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
        cwd="/work/proj"
      />
    );

    expect(screen.getByText(/SKILLS & CAPABILITIES HUB/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
      expect(screen.getByText('/verify')).toBeInTheDocument();
      expect(screen.getByText('/antigravity-guide')).toBeInTheDocument();
    });

    expect(screen.getByText('scripts/')).toBeInTheDocument();
    expect(screen.getByText('resources/')).toBeInTheDocument();
  });

  it('filters skills by scope pills', async () => {
    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    });

    // Click PROJECT scope filter
    const projectBtn = screen.getByRole('button', { name: /^PROJECT/i });
    fireEvent.click(projectBtn);

    expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    expect(screen.queryByText('/verify')).not.toBeInTheDocument();
    expect(screen.queryByText('/antigravity-guide')).not.toBeInTheDocument();

    // Click GLOBAL scope filter
    const globalBtn = screen.getByRole('button', { name: /^GLOBAL/i });
    fireEvent.click(globalBtn);

    expect(screen.queryByText('/deploy-staging')).not.toBeInTheDocument();
    expect(screen.getByText('/verify')).toBeInTheDocument();
    expect(screen.queryByText('/antigravity-guide')).not.toBeInTheDocument();
  });

  it('filters skills by search input', async () => {
    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText(/Search skills/i);
    fireEvent.change(searchInput, { target: { value: 'staging' } });

    expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    expect(screen.queryByText('/verify')).not.toBeInTheDocument();
    expect(screen.queryByText('/antigravity-guide')).not.toBeInTheDocument();
  });

  it('inspects skill content and opens markdown drawer', async () => {
    mockFetchSkillContent.mockResolvedValue({
      name: 'deploy-staging',
      description: 'Deploy branch to staging environment',
      content: '## Staging Runbook\nExecute deployment.',
      path: '/work/proj/.agents/skills/deploy-staging/SKILL.md',
      scope: 'workspace',
    });

    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    });

    const inspectButtons = screen.getAllByRole('button', { name: /INSPECT/i });
    fireEvent.click(inspectButtons[0]);

    await waitFor(() => {
      expect(mockFetchSkillContent).toHaveBeenCalledWith(
        'test-token',
        '/work/proj/.agents/skills/deploy-staging/SKILL.md'
      );
      expect(screen.getByText(/Staging Runbook/i)).toBeInTheDocument();
    });
  });

  it('executes skill command and closes modal on RUN click', async () => {
    const onExecute = vi.fn();
    const onClose = vi.fn();

    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={onClose}
        token="test-token"
        onExecuteSkill={onExecute}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    });

    const runButtons = screen.getAllByRole('button', { name: /RUN/i });
    fireEvent.click(runButtons[0]);

    expect(onExecute).toHaveBeenCalledWith('/deploy-staging ');
    expect(onClose).toHaveBeenCalled();
  });

  it('scaffolds a new skill and adds it to list', async () => {
    mockScaffoldSkill.mockResolvedValue({
      name: 'security-scan',
      description: 'Run static security audit',
      scope: 'workspace',
      path: '/work/proj/.agents/skills/security-scan',
      skillFile: '/work/proj/.agents/skills/security-scan/SKILL.md',
      hasScripts: false,
      hasResources: false,
    });
    mockFetchSkillContent.mockResolvedValue({
      name: 'security-scan',
      description: 'Run static security audit',
      content: '# Security Scan\nInstructions here.',
      path: '/work/proj/.agents/skills/security-scan/SKILL.md',
      scope: 'workspace',
    });

    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
        cwd="/work/proj"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    });

    // Click "New Skill"
    const newSkillBtn = screen.getByRole('button', { name: /New Skill/i });
    fireEvent.click(newSkillBtn);

    // Form inputs
    const nameInput = screen.getByPlaceholderText('skill-name');
    const descInput = screen.getByPlaceholderText(/Brief description/i);
    fireEvent.change(nameInput, { target: { value: 'security-scan' } });
    fireEvent.change(descInput, { target: { value: 'Run static security audit' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: /Create Skill/i });
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(mockScaffoldSkill).toHaveBeenCalledWith('test-token', {
        name: 'security-scan',
        description: 'Run static security audit',
        scope: 'workspace',
        cwd: '/work/proj',
      });
      expect(screen.getByText('/security-scan')).toBeInTheDocument();
    });
  });

  it('calls onClose when Escape key is pressed', () => {
    const onClose = vi.fn();
    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={onClose}
        token="test-token"
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

