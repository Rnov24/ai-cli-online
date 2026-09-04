import React, { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';
import type { TabState } from '../types';

export const TabBar = React.memo(() => {
  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const addTab = useStore((s) => s.addTab);
  const switchTab = useStore((s) => s.switchTab);
  const closeTab = useStore((s) => s.closeTab);
  const renameTab = useStore((s) => s.renameTab);
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const openTabs = tabs.filter((tab) => tab.status === 'open');

  useEffect(() => {
    if (renamingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [renamingTabId]);

  const handleDoubleClick = (tab: TabState) => {
    setRenamingTabId(tab.id);
    setRenameValue(tab.name);
  };

  const commitRename = () => {
    if (renamingTabId && renameValue.trim()) {
      renameTab(renamingTabId, renameValue.trim());
    }
    setRenamingTabId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingTabId(null);
    setRenameValue('');
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      commitRename();
    } else if (e.key === 'Escape') {
      cancelRename();
    }
  };

  const handleTabClick = (tabId: string) => {
    if (renamingTabId) return;
    switchTab(tabId);
  };

  const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    closeTab(tabId);
  };

  const handleMiddleClick = (e: React.MouseEvent, tabId: string) => {
    if (e.button === 1) {
      e.preventDefault();
      closeTab(tabId);
    }
  };

  const showCloseButton = openTabs.length > 1;

  return (
    <div
      className="tab-bar"
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px',
        height: '30px',
        backgroundColor: 'var(--bg-secondary)',
        borderTop: '1px solid var(--border)',
        flexShrink: 0,
        overflowX: 'auto',
        gap: '4px',
        fontFamily: 'var(--font-mono)',
        fontSize: '11px',
        userSelect: 'none',
      }}
    >
      <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-muted)', marginRight: '4px', letterSpacing: '0.8px' }}>
        TABS //
      </span>

      {openTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const isRenaming = renamingTabId === tab.id;
        const terminalCount = tab.terminalIds.length;

        return (
          <div
            key={tab.id}
            onClick={() => handleTabClick(tab.id)}
            onDoubleClick={() => handleDoubleClick(tab)}
            onMouseDown={(e) => handleMiddleClick(e, tab.id)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '3px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              borderRadius: '2px 2px 0 0',
              backgroundColor: isActive ? 'var(--bg-primary)' : 'transparent',
              color: isActive ? 'var(--accent-amber-bright)' : 'var(--text-secondary)',
              borderBottom: isActive ? '2px solid var(--accent-amber)' : '2px solid transparent',
              borderLeft: isActive ? '1px solid var(--border)' : '1px solid transparent',
              borderRight: isActive ? '1px solid var(--border)' : '1px solid transparent',
              transition: 'all 0.15s ease',
            }}
          >
            {isRenaming ? (
              <input
                ref={inputRef}
                type="text"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={commitRename}
                onKeyDown={handleRenameKeyDown}
                style={{
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--accent-amber)',
                  color: 'var(--text-bright)',
                  fontSize: '11px',
                  fontFamily: 'inherit',
                  padding: '0 4px',
                  borderRadius: '2px',
                  outline: 'none',
                  width: '90px',
                }}
              />
            ) : (
              <>
                <span style={{
                  maxWidth: '140px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  fontWeight: isActive ? 700 : 500,
                }}>
                  {tab.name}
                </span>
                {terminalCount > 1 && (
                  <span style={{ fontSize: '9px', color: 'var(--text-muted)' }}>
                    [{terminalCount}]
                  </span>
                )}
                {showCloseButton && (
                  <button
                    onClick={(e) => handleCloseClick(e, tab.id)}
                    title="Close session tab"
                    aria-label="Close tab"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--text-muted)',
                      cursor: 'pointer',
                      fontSize: '11px',
                      padding: '0 2px',
                      lineHeight: 1,
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent-red)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)'; }}
                  >
                    ×
                  </button>
                )}
              </>
            )}
          </div>
        );
      })}

      <button
        onClick={() => addTab()}
        title="Initialize new session tab (⌘N)"
        aria-label="Add new tab"
        className="mecha-btn"
        style={{
          padding: '2px 7px',
          fontSize: '11px',
          height: '22px',
          marginLeft: '4px',
        }}
      >
        + NEW
      </button>
    </div>
  );
});

TabBar.displayName = 'TabBar';
