interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutEntry {
  key: string;
  desc: string;
  category: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { key: '⌘K / Ctrl+K', desc: 'Open Command Palette', category: 'GLOBAL' },
  { key: '⌘N / Ctrl+N', desc: 'Initialize New Session Tab', category: 'GLOBAL' },
  { key: '⌘/ / Ctrl+/', desc: 'Focus Command Input Console', category: 'GLOBAL' },
  { key: 'Esc', desc: 'Close Modal / Stop / Dismiss Menu', category: 'GLOBAL' },
  { key: 'Enter', desc: 'Transmit Command to Agent', category: 'COMMAND BAR' },
  { key: 'Shift+Enter', desc: 'Insert Newline in Command Bar', category: 'COMMAND BAR' },
  { key: '↑ / ↓', desc: 'Navigate Command History / Autocomplete', category: 'COMMAND BAR' },
  { key: 'Tab', desc: 'Accept Autocomplete Suggestion', category: 'COMMAND BAR' },
  { key: '⌥T / Alt+T', desc: 'Toggle Tasks & Plan Annotations Panel', category: 'PANELS' },
  { key: '⌥F / Alt+F', desc: 'Toggle Workspace Files Explorer', category: 'PANELS' },
  { key: '⌥G / Alt+G', desc: 'Toggle Git History & Diff Visualizer', category: 'PANELS' },
  { key: '⌥C / Alt+C', desc: 'Toggle System Context Panel', category: 'PANELS' },
  { key: '?', desc: 'Open Keyboard Shortcuts Reference', category: 'HELP' },
];

export function ShortcutsModal({ isOpen, onClose }: ShortcutsModalProps) {
  if (!isOpen) return null;

  const categories = Array.from(new Set(SHORTCUTS.map((s) => s.category)));

  return (
    <div className="cmd-palette-backdrop" onClick={onClose}>
      <div className="cmd-palette-modal" style={{ maxWidth: '580px' }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ color: 'var(--accent-amber-bright)', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              [⌘]
            </span>
            <span style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              fontWeight: 700,
              color: 'var(--text-bright)',
              letterSpacing: '0.8px',
            }}>
              KEYBOARD SHORTCUTS MATRIX
            </span>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{
          padding: '14px 16px',
          maxHeight: 'min(480px, calc(100dvh - 120px))',
          overflowY: 'auto',
          backgroundColor: 'var(--bg-secondary)',
        }}>
          {categories.map((cat) => (
            <div key={cat} style={{ marginBottom: '16px' }}>
              <div style={{
                fontSize: '10px',
                fontFamily: 'var(--font-mono)',
                color: 'var(--accent-cyan-bright)',
                fontWeight: 700,
                letterSpacing: '0.8px',
                marginBottom: '8px',
                borderBottom: '1px dashed var(--border)',
                paddingBottom: '3px',
              }}>
                // {cat}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {SHORTCUTS.filter((s) => s.category === cat).map((s) => (
                  <div
                    key={s.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      borderRadius: '3px',
                      backgroundColor: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span style={{
                      fontSize: '11px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-primary)',
                    }}>
                      {s.desc}
                    </span>
                    <kbd style={{
                      display: 'inline-block',
                      padding: '2px 6px',
                      fontSize: '10px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--accent-amber-bright)',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border)',
                      borderRadius: '3px',
                    }}>
                      {s.key}
                    </kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div style={{
          padding: '8px 16px',
          borderTop: '1px solid var(--border)',
          backgroundColor: 'var(--bg-primary)',
          fontSize: '10px',
          fontFamily: 'var(--font-mono)',
          color: 'var(--text-muted)',
          textAlign: 'right',
        }}>
          PRESS [ESC] TO CLOSE
        </div>
      </div>
    </div>
  );
}
