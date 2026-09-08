import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as Icons from './index';

describe('SVG Icon System', () => {
  afterEach(() => {
    cleanup();
  });

  const allIcons = [
    { name: 'HomeIcon', Component: Icons.HomeIcon },
    { name: 'FolderIcon', Component: Icons.FolderIcon },
    { name: 'FileIcon', Component: Icons.FileIcon },
    { name: 'FileTextIcon', Component: Icons.FileTextIcon },
    { name: 'GitBranchIcon', Component: Icons.GitBranchIcon },
    { name: 'TaskPulseIcon', Component: Icons.TaskPulseIcon },
    { name: 'ActivityIcon', Component: Icons.ActivityIcon },
    { name: 'SettingsIcon', Component: Icons.SettingsIcon },
    { name: 'HelpIcon', Component: Icons.HelpIcon },
    { name: 'LogoutIcon', Component: Icons.LogoutIcon },
    { name: 'MenuIcon', Component: Icons.MenuIcon },
    { name: 'SearchIcon', Component: Icons.SearchIcon },
    { name: 'SunIcon', Component: Icons.SunIcon },
    { name: 'MoonIcon', Component: Icons.MoonIcon },
    { name: 'CheckIcon', Component: Icons.CheckIcon },
    { name: 'CloseIcon', Component: Icons.CloseIcon },
    { name: 'CrossIcon', Component: Icons.CrossIcon },
    { name: 'EditIcon', Component: Icons.EditIcon },
    { name: 'TrashIcon', Component: Icons.TrashIcon },
    { name: 'SaveIcon', Component: Icons.SaveIcon },
    { name: 'CopyIcon', Component: Icons.CopyIcon },
    { name: 'HourglassIcon', Component: Icons.HourglassIcon },
    { name: 'DownloadIcon', Component: Icons.DownloadIcon },
    { name: 'RobotIcon', Component: Icons.RobotIcon },
    { name: 'TerminalWindowIcon', Component: Icons.TerminalWindowIcon },
    { name: 'LaptopIcon', Component: Icons.LaptopIcon },
    { name: 'BoltIcon', Component: Icons.BoltIcon },
    { name: 'ClipboardIcon', Component: Icons.ClipboardIcon },
    { name: 'WorklogIcon', Component: Icons.WorklogIcon },
    { name: 'TargetIcon', Component: Icons.TargetIcon },
    { name: 'StethoscopeIcon', Component: Icons.StethoscopeIcon },
    { name: 'ShieldIcon', Component: Icons.ShieldIcon },
    { name: 'AlertTriangleIcon', Component: Icons.AlertTriangleIcon },
    { name: 'ScrollIcon', Component: Icons.ScrollIcon },
    { name: 'TabsIcon', Component: Icons.TabsIcon },
    { name: 'RocketIcon', Component: Icons.RocketIcon },
    { name: 'PuzzleIcon', Component: Icons.PuzzleIcon },
    { name: 'KeyboardIcon', Component: Icons.KeyboardIcon },
    { name: 'DesktopScreenIcon', Component: Icons.DesktopScreenIcon },
    { name: 'PlusIcon', Component: Icons.PlusIcon },
    { name: 'MinusIcon', Component: Icons.MinusIcon },
    { name: 'ChevronRightIcon', Component: Icons.ChevronRightIcon },
    { name: 'ChevronLeftIcon', Component: Icons.ChevronLeftIcon },
  ];

  it('exports createIcon and IconProps', () => {
    expect(typeof Icons.createIcon).toBe('function');
  });

  describe('Icon rendering and aria-hidden', () => {
    allIcons.forEach(({ name, Component }) => {
      it(`renders ${name} as an SVG element with aria-hidden="true"`, () => {
        const { container } = render(<Component />);
        const svg = container.querySelector('svg');
        expect(svg).toBeInTheDocument();
        expect(svg).toHaveAttribute('aria-hidden', 'true');
        expect(svg).toHaveAttribute('width', '14');
        expect(svg).toHaveAttribute('height', '14');
        expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
        expect(svg?.children.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Props propagation', () => {
    it('applies custom size to width and height', () => {
      const { container } = render(<Icons.HomeIcon size={24} />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '24');
      expect(svg).toHaveAttribute('height', '24');
    });

    it('applies string size', () => {
      const { container } = render(<Icons.SettingsIcon size="1.5rem" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('width', '1.5rem');
      expect(svg).toHaveAttribute('height', '1.5rem');
    });

    it('applies custom color to stroke', () => {
      const { container } = render(<Icons.BoltIcon color="#ff6600" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('stroke', '#ff6600');
    });

    it('applies custom className and style', () => {
      const { container } = render(
        <Icons.RobotIcon className="spin-animation" style={{ opacity: 0.8 }} />
      );
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('spin-animation');
      expect(svg?.style.opacity).toBe('0.8');
      expect(svg?.style.display).toBe('inline-block');
      expect(svg?.style.verticalAlign).toBe('middle');
    });

    it('renders title element when title prop is provided', () => {
      const { container } = render(<Icons.HelpIcon title="Help Information" />);
      const title = container.querySelector('title');
      expect(title).toBeInTheDocument();
      expect(title?.textContent).toBe('Help Information');
    });

    it('forwards ref to the underlying SVG element', () => {
      const ref = React.createRef<SVGSVGElement>();
      render(<Icons.CheckIcon ref={ref} />);
      expect(ref.current).toBeInstanceOf(SVGSVGElement);
    });
  });
});
