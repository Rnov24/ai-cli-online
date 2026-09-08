import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { safeSaveChatMessages } from './AiChatView';
import type { ChatMessage } from './AiChatView';

describe('AiChatView safeSaveChatMessages', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('saves chat messages to localStorage with standard key', () => {
    const messages: ChatMessage[] = [
      {
        id: 'msg-1',
        role: 'user',
        content: 'Hello Antigravity',
        timestamp: Date.now(),
      },
      {
        id: 'msg-2',
        role: 'assistant',
        content: 'Hello! How can I assist you today?',
        timestamp: Date.now() + 100,
      },
    ];

    safeSaveChatMessages('tab-1', messages);

    const savedRaw = localStorage.getItem('chat-messages-tab-1');
    expect(savedRaw).not.toBeNull();
    const parsed = JSON.parse(savedRaw!);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe('msg-1');
    expect(parsed[1].id).toBe('msg-2');
  });

  it('does nothing if sessionId is empty', () => {
    safeSaveChatMessages('', [{ id: '1', role: 'user', content: 'test', timestamp: 1 }]);
    expect(localStorage.length).toBe(0);
  });

  it('recovers from QuotaExceededError by saving truncated history', () => {
    const messages: ChatMessage[] = Array.from({ length: 80 }, (_, i) => ({
      id: `msg-${i + 1}`,
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `Message content ${i + 1}`,
      timestamp: Date.now() + i,
    }));

    let callCount = 0;
    const originalSetItem = localStorage.setItem.bind(localStorage);

    vi.spyOn(localStorage, 'setItem').mockImplementation((key: string, value: string) => {
      callCount++;
      if (callCount === 1) {
        // First call with full 80 messages throws QuotaExceededError
        throw new Error('QuotaExceededError: DOM Exception 22');
      }
      // Second call with truncated 50 messages succeeds
      return originalSetItem(key, value);
    });

    safeSaveChatMessages('tab-quota', messages);

    expect(callCount).toBe(2);
    const savedRaw = localStorage.getItem('chat-messages-tab-quota');
    expect(savedRaw).not.toBeNull();
    const parsed = JSON.parse(savedRaw!);
    expect(parsed).toHaveLength(50);
    // Should preserve the latest 50 messages (msg-31 through msg-80)
    expect(parsed[0].id).toBe('msg-31');
    expect(parsed[49].id).toBe('msg-80');
  });

  it('suppresses unhandled error if storage fails completely', () => {
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new Error('Permanent storage failure');
    });

    expect(() => {
      safeSaveChatMessages('tab-err', [{ id: '1', role: 'user', content: 'hello', timestamp: 1 }]);
    }).not.toThrow();
  });
});
