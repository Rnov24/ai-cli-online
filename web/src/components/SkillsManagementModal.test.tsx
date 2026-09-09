import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { SkillsManagementModal } from './SkillsManagementModal';
import {
  fetchSkills,
  fetchSkillContent,
  scaffoldSkill,
  searchSkills,
  installSkill,
  deleteSkill,
  syncSkills,
  type SkillItem,
  type RemoteSkillItem,
} from '../api/skills';

vi.mock('../api/skills', () => ({
  fetchSkills: vi.fn(),
  fetchSkillContent: vi.fn(),
  scaffoldSkill: vi.fn(),
  searchSkills: vi.fn(),
  installSkill: vi.fn(),
  deleteSkill: vi.fn(),
  syncSkills: vi.fn(),
}));

const mockFetchSkills = vi.mocked(fetchSkills);
const mockFetchSkillContent = vi.mocked(fetchSkillContent);
const mockScaffoldSkill = vi.mocked(scaffoldSkill);
const mockSearchSkills = vi.mocked(searchSkills);
const mockInstallSkill = vi.mocked(installSkill);
const mockDeleteSkill = vi.mocked(deleteSkill);
const mockSyncSkills = vi.mocked(syncSkills);

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

describe('SkillsManagementModal', { timeout: 45000 }, () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchSkills.mockResolvedValue({
      workspacePath: '/work/proj',
      isHome: false,
      skills: mockSkills,
      count: 3,
    });
    mockSearchSkills.mockResolvedValue({
      query: 'anti-slop',
      skills: [
        {
          id: 'miqdadbadjuber/anti-slop/antislop',
          skillId: 'antislop',
          name: 'antislop',
          installs: 946,
          source: 'miqdadbadjuber/anti-slop',
        },
        {
          id: 'shadcn/improve/improve',
          skillId: 'improve',
          name: 'improve',
          installs: 4200,
          source: 'shadcn/improve',
        },
      ],
      count: 2,
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

    const searchInput = screen.getByPlaceholderText(/Search skills\.\.\./i);
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

  it('switches between INSTALLED and EXPLORE SKILLS.SH tabs', async () => {
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

    const exploreTab = screen.getByRole('button', { name: /EXPLORE SKILLS\.SH/i });
    fireEvent.click(exploreTab);

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/Search 600k\+ community skills/i)).toBeInTheDocument();
    });

    const installedTab = screen.getByRole('button', { name: /^INSTALLED/i });
    fireEvent.click(installedTab);

    await waitFor(() => {
      expect(screen.getByText('/deploy-staging')).toBeInTheDocument();
    });
  });

  it('renders remote search results from skills.sh', async () => {
    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
      />
    );

    const exploreTab = screen.getByRole('button', { name: /EXPLORE SKILLS\.SH/i });
    fireEvent.click(exploreTab);

    await waitFor(() => {
      expect(mockSearchSkills).toHaveBeenCalled();
      expect(screen.getByText('/antislop')).toBeInTheDocument();
      expect(screen.getByText('/improve')).toBeInTheDocument();
    });
  });

  it('installs a skill from explore tab', async () => {
    mockInstallSkill.mockResolvedValue({
      name: 'antislop',
      description: 'Anti-slop instructions',
      scope: 'workspace',
      path: '/work/proj/.agents/skills/antislop',
      skillFile: '/work/proj/.agents/skills/antislop/SKILL.md',
      hasScripts: false,
      hasResources: false,
    });

    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
        cwd="/work/proj"
      />
    );

    const exploreTab = screen.getByRole('button', { name: /EXPLORE SKILLS\.SH/i });
    fireEvent.click(exploreTab);

    await waitFor(() => {
      expect(screen.getByText('/antislop')).toBeInTheDocument();
    });

    const installButtons = screen.getAllByRole('button', { name: /^INSTALL$/i });
    fireEvent.click(installButtons[0]);

    await waitFor(() => {
      expect(mockInstallSkill).toHaveBeenCalledWith('test-token', {
        source: 'miqdadbadjuber/anti-slop',
        skillName: 'antislop',
        scope: 'workspace',
        cwd: '/work/proj',
      });
      expect(screen.getByText(/Installed \/antislop/i)).toBeInTheDocument();
    });
  });

  it('uninstalls a skill from installed list', async () => {
    mockDeleteSkill.mockResolvedValue({ ok: true, name: 'deploy-staging' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);

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

    const uninstallButtons = screen.getAllByRole('button', { name: /UNINSTALL/i });
    fireEvent.click(uninstallButtons[0]);

    await waitFor(() => {
      expect(mockDeleteSkill).toHaveBeenCalledWith('test-token', 'deploy-staging', 'workspace', '/work/proj');
      expect(screen.queryByText('/deploy-staging')).not.toBeInTheDocument();
    });
  });

  it('syncs skills from skills-lock.json', async () => {
    mockSyncSkills.mockResolvedValue({
      synced: 2,
      restored: ['missing-skill'],
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

    const syncBtn = screen.getByRole('button', { name: /SYNC/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(mockSyncSkills).toHaveBeenCalledWith('test-token', '/work/proj');
      expect(screen.getByText(/Synced 2 skills from skills-lock\.json/i)).toBeInTheDocument();
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

  const generateMockSkills = (count: number): SkillItem[] => {
    return Array.from({ length: count }, (_, i) => ({
      name: `skill-${String(i + 1).padStart(2, '0')}`,
      description: `Description for skill ${i + 1}`,
      scope: (i % 3 === 0 ? 'workspace' : i % 3 === 1 ? 'global' : 'builtin') as 'workspace' | 'global' | 'builtin',
      path: `/path/skill-${i + 1}`,
      skillFile: `/path/skill-${i + 1}/SKILL.md`,
      hasScripts: false,
      hasResources: false,
    }));
  };

  it('renders pagination bar with correct item count and page indicators', async () => {
    const manySkills = generateMockSkills(25);
    mockFetchSkills.mockResolvedValue({
      workspacePath: '/work/proj',
      isHome: false,
      skills: manySkills,
      count: 25,
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
      expect(screen.getByText('/skill-01')).toBeInTheDocument();
    });

    const pageSizeSelect = screen.getByLabelText(/Items per page/i);
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });

    expect(screen.getByText('SHOWING 1-10 OF 25 SKILLS')).toBeInTheDocument();
    expect(screen.getByText('PAGE 1 OF 3')).toBeInTheDocument();

    // Verify only 10 skill cards are rendered in the DOM
    expect(screen.getByText('/skill-01')).toBeInTheDocument();
    expect(screen.getByText('/skill-10')).toBeInTheDocument();
    expect(screen.queryByText('/skill-11')).not.toBeInTheDocument();
  });

  it('navigates to next page on NEXT button click', async () => {
    const manySkills = generateMockSkills(25);
    mockFetchSkills.mockResolvedValue({
      workspacePath: '/work/proj',
      isHome: false,
      skills: manySkills,
      count: 25,
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
      expect(screen.getByText('/skill-01')).toBeInTheDocument();
    });

    const pageSizeSelect = screen.getByLabelText(/Items per page/i);
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });

    const nextButton = screen.getByRole('button', { name: /NEXT/i });
    fireEvent.click(nextButton);

    expect(screen.getByText('PAGE 2 OF 3')).toBeInTheDocument();
    expect(screen.getByText('SHOWING 11-20 OF 25 SKILLS')).toBeInTheDocument();
    expect(screen.queryByText('/skill-01')).not.toBeInTheDocument();
    expect(screen.getByText('/skill-11')).toBeInTheDocument();
    expect(screen.getByText('/skill-20')).toBeInTheDocument();
    expect(screen.queryByText('/skill-21')).not.toBeInTheDocument();

    const prevButton = screen.getByRole('button', { name: /PREV/i });
    expect(prevButton).not.toBeDisabled();
  });

  it('disables PREV button on first page and NEXT button on last page', async () => {
    const manySkills = generateMockSkills(25);
    mockFetchSkills.mockResolvedValue({
      workspacePath: '/work/proj',
      isHome: false,
      skills: manySkills,
      count: 25,
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
      expect(screen.getByText('/skill-01')).toBeInTheDocument();
    });

    const pageSizeSelect = screen.getByLabelText(/Items per page/i);
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });

    const prevButton = screen.getByRole('button', { name: /PREV/i });
    const nextButton = screen.getByRole('button', { name: /NEXT/i });

    expect(prevButton).toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    // Navigate to page 2 then page 3
    fireEvent.click(nextButton);
    expect(screen.getByText('PAGE 2 OF 3')).toBeInTheDocument();
    expect(prevButton).not.toBeDisabled();
    expect(nextButton).not.toBeDisabled();

    fireEvent.click(nextButton);
    expect(screen.getByText('PAGE 3 OF 3')).toBeInTheDocument();
    expect(prevButton).not.toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  it('resets page to 1 when search query or scope filter changes', async () => {
    const manySkills = generateMockSkills(25);
    mockFetchSkills.mockResolvedValue({
      workspacePath: '/work/proj',
      isHome: false,
      skills: manySkills,
      count: 25,
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
      expect(screen.getByText('/skill-01')).toBeInTheDocument();
    });

    const pageSizeSelect = screen.getByLabelText(/Items per page/i);
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });

    const nextButton = screen.getByRole('button', { name: /NEXT/i });
    fireEvent.click(nextButton);
    expect(screen.getByText('PAGE 2 OF 3')).toBeInTheDocument();

    // Change search query
    const searchInput = screen.getByPlaceholderText(/Search skills\.\.\./i);
    fireEvent.change(searchInput, { target: { value: 'skill' } });

    expect(screen.getByText(/PAGE 1 OF/i)).toBeInTheDocument();

    // Move to page 2 again
    fireEvent.click(nextButton);
    expect(screen.getByText('PAGE 2 OF 3')).toBeInTheDocument();

    // Click scope filter pill
    const projectScopePill = screen.getByRole('button', { name: /^PROJECT/i });
    fireEvent.click(projectScopePill);

    expect(screen.getByText(/PAGE 1 OF/i)).toBeInTheDocument();
  });

  it('updates displayed items when page size select changes', async () => {
    const manySkills = generateMockSkills(25);
    mockFetchSkills.mockResolvedValue({
      workspacePath: '/work/proj',
      isHome: false,
      skills: manySkills,
      count: 25,
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
      expect(screen.getByText('/skill-01')).toBeInTheDocument();
    });

    const pageSizeSelect = screen.getByLabelText(/Items per page/i);
    // First set to 10
    fireEvent.change(pageSizeSelect, { target: { value: '10' } });
    expect(screen.getByText('SHOWING 1-10 OF 25 SKILLS')).toBeInTheDocument();
    expect(screen.getByText('PAGE 1 OF 3')).toBeInTheDocument();

    // Change page size select from 10 to 25
    fireEvent.change(pageSizeSelect, { target: { value: '25' } });
    expect(screen.getByText('SHOWING 1-25 OF 25 SKILLS')).toBeInTheDocument();
    expect(screen.getByText('PAGE 1 OF 1')).toBeInTheDocument();

    // Verify all 25 skills are rendered on page 1 of 1
    expect(screen.getByText('/skill-01')).toBeInTheDocument();
    expect(screen.getByText('/skill-25')).toBeInTheDocument();
  });

  it('paginates remote skills in explore tab', async () => {
    const manyRemote: RemoteSkillItem[] = Array.from({ length: 15 }, (_, i) => ({
      id: `owner/skill-${i + 1}/skill-${i + 1}`,
      skillId: `remote-skill-${i + 1}`,
      name: `remote-skill-${i + 1}`,
      installs: 100 + i,
      source: `owner/skill-${i + 1}`,
    }));
    mockSearchSkills.mockResolvedValue({
      query: '',
      skills: manyRemote,
      count: 15,
    });

    render(
      <SkillsManagementModal
        isOpen={true}
        onClose={vi.fn()}
        token="test-token"
        cwd="/work/proj"
      />
    );

    // Switch to EXPLORE tab
    const exploreTab = screen.getByRole('button', { name: /EXPLORE/i });
    fireEvent.click(exploreTab);

    await waitFor(() => {
      expect(screen.getByText('/remote-skill-1')).toBeInTheDocument();
    });

    // Default explore page size is 10
    expect(screen.getByText('SHOWING 1-10 OF 15 SKILLS')).toBeInTheDocument();
    expect(screen.getByText('PAGE 1 OF 2')).toBeInTheDocument();
    expect(screen.getByText('/remote-skill-10')).toBeInTheDocument();
    expect(screen.queryByText('/remote-skill-11')).not.toBeInTheDocument();

    // Click NEXT
    const nextButtons = screen.getAllByRole('button', { name: /NEXT/i });
    fireEvent.click(nextButtons[0]);

    expect(screen.getByText('PAGE 2 OF 2')).toBeInTheDocument();
    expect(screen.getByText('/remote-skill-11')).toBeInTheDocument();
    expect(screen.getByText('/remote-skill-15')).toBeInTheDocument();
  });
});

