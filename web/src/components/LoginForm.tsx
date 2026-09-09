import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { login, verify } from '../api/auth';
import { getSavedAccounts, saveAccount, type AccountProfile } from '../utils/accountStorage';
import { UserIcon, KeyIcon } from './icons';

export function LoginForm() {
  const [inputToken, setInputToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<AccountProfile[]>([]);
  const [authRequired, setAuthRequired] = useState<boolean | null>(null);
  const setToken = useStore((s) => s.setToken);

  useEffect(() => {
    setSavedAccounts(getSavedAccounts());
    verify('').then((res) => {
      setAuthRequired(res.authRequired ?? res.auth_required ?? null);
    }).catch(() => {
      // Offline or network error
    });
  }, []);

  const handleConnect = async (tokenToUse: string, profileName?: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await login(tokenToUse);
      if (!res.ok) {
        setError(res.error || 'Authentication failed. Invalid token.');
        setLoading(false);
        return;
      }
      saveAccount(tokenToUse, profileName);
      setToken(tokenToUse);
    } catch {
      setError('Failed to reach server. Please check connection.');
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const token = inputToken.trim() || 'default';
    handleConnect(token);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        background: 'radial-gradient(ellipse at 50% 0%, rgba(122, 162, 247, 0.08) 0%, var(--bg-primary) 70%)',
      }}
    >
      <div
        className="login-card"
        style={{
          backgroundColor: 'var(--bg-tertiary)',
          borderRadius: '12px',
          padding: '36px 32px',
          width: '100%',
          maxWidth: '420px',
          border: '1px solid var(--border)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div
            style={{
              width: '56px',
              height: '56px',
              margin: '0 auto 16px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-purple) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '24px',
              color: 'var(--bg-primary)',
              fontWeight: 'bold',
              boxShadow: '0 4px 16px rgba(122, 162, 247, 0.3)',
            }}
          >
            &gt;_
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 'bold',
              color: 'var(--text-bright)',
              marginBottom: '6px',
              letterSpacing: '0.5px',
            }}
          >
            AGY Online
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
            Antigravity CLI workspace
          </p>

          {authRequired !== null && (
            <div style={{ marginTop: '10px' }}>
              <span
                style={{
                  display: 'inline-block',
                  fontSize: '11px',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: authRequired ? 'rgba(187, 154, 247, 0.15)' : 'rgba(158, 206, 106, 0.15)',
                  color: authRequired ? 'var(--accent-purple)' : 'var(--accent-green)',
                  border: `1px solid ${authRequired ? 'rgba(187, 154, 247, 0.3)' : 'rgba(158, 206, 106, 0.3)'}`,
                  fontWeight: 500,
                }}
              >
                {authRequired ? 'Password Protected' : 'Open Access (No Token Required)'}
              </span>
            </div>
          )}
        </div>

        {error && (
          <div
            role="alert"
            style={{
              marginBottom: '20px',
              padding: '10px 14px',
              backgroundColor: 'rgba(247, 118, 142, 0.12)',
              border: '1px solid rgba(247, 118, 142, 0.4)',
              borderRadius: '8px',
              color: 'var(--accent-red, #f7768e)',
              fontSize: '13px',
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {savedAccounts.length > 0 && (
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                fontSize: '12px',
                color: 'var(--text-secondary)',
                marginBottom: '8px',
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <UserIcon size={12} /> Saved Profiles
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {savedAccounts.map((acc) => (
                <button
                  key={acc.id}
                  type="button"
                  disabled={loading}
                  onClick={() => handleConnect(acc.token, acc.name)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    backgroundColor: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: '8px',
                    color: 'var(--text-bright)',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    fontSize: '13px',
                    textAlign: 'left',
                    opacity: loading ? 0.7 : 1,
                    transition: 'border-color 0.15s, background-color 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    if (!loading) (e.currentTarget.style.borderColor = 'var(--accent-blue)');
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget.style.borderColor = 'var(--border)');
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div
                      style={{
                        width: '28px',
                        height: '28px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(122, 162, 247, 0.15)',
                        color: 'var(--accent-blue)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <UserIcon size={14} />
                    </div>
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600 }}>{acc.name}</span>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      color: 'var(--accent-blue)',
                      marginLeft: '8px',
                      flexShrink: 0,
                    }}
                  >
                    Connect &rarr;
                  </span>
                </button>
              ))}
            </div>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                margin: '20px 0 16px',
                gap: '12px',
              }}
            >
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', textTransform: 'uppercase' }}>
                or enter token
              </span>
              <div style={{ flex: 1, height: '1px', backgroundColor: 'var(--border)' }} />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '20px' }}>
            <label
              htmlFor="token"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '12px',
                color: 'var(--accent-blue)',
                marginBottom: '8px',
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              <KeyIcon size={12} /> Auth Token
            </label>
            <input
              type="password"
              id="token"
              className="login-input"
              value={inputToken}
              onChange={(e) => {
                setInputToken(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Enter AUTH_TOKEN (leave blank if none set)"
              autoFocus
              autoComplete="current-password"
              disabled={loading}
              style={{
                width: '100%',
                padding: '11px 14px',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-bright)',
                border: '1px solid var(--border)',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
              }}
            />
            <p style={{ color: 'var(--text-secondary)', fontSize: '12px', marginTop: '6px' }}>
              Haven't set a password? Just leave blank and click Connect.
            </p>
          </div>

          <button
            type="submit"
            className="login-submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '11px',
              background: 'linear-gradient(135deg, var(--accent-blue) 0%, var(--accent-cyan) 100%)',
              color: 'var(--bg-primary)',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              letterSpacing: '0.3px',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Connecting...' : 'Connect'}
          </button>
        </form>

        <div
          style={{
            marginTop: '24px',
            textAlign: 'center',
            color: 'var(--scrollbar-thumb-hover)',
            fontSize: '11px',
          }}
        >
          <p>
            Configured via{' '}
            <code
              style={{
                backgroundColor: 'var(--bg-primary)',
                padding: '2px 6px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
                fontSize: '11px',
              }}
            >
              .env
            </code>{' '}
            (AUTH_TOKEN)
          </p>
        </div>
      </div>
    </div>
  );
}
