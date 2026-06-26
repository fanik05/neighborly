'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useConversations } from '@/lib/useConversations';
import ConversationList from '@/components/ConversationList';

export default function MessagesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { conversations } = useConversations();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <p className="py-16 text-center text-muted">Loading…</p>;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="animate-rise mb-4 text-3xl font-bold">Messages</h1>
      <div className="animate-rise overflow-hidden rounded-tag border border-line bg-card shadow-card" style={{ animationDelay: '60ms' }}>
        <ConversationList conversations={conversations} />
      </div>
    </div>
  );
}
