'use client';

import { useState } from 'react';

export default function MessageComposer({
  onSend,
  onTyping,
}: {
  onSend: (text: string) => void;
  onTyping: (isTyping: boolean) => void;
}) {
  const [text, setText] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text);
    setText('');
    onTyping(false);
  }

  return (
    <form onSubmit={submit} className="flex gap-2 border-t border-line p-3">
      <input
        className="field"
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onTyping(e.target.value.length > 0);
        }}
        placeholder="Write a message…"
        aria-label="Message"
        maxLength={2000}
      />
      <button type="submit" className="btn-primary shrink-0" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}
