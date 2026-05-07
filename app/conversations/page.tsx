import { redirect } from 'next/navigation';

export default async function ConversationsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const { session } = await searchParams;
  redirect(session ? `/chat/${session}` : '/chat');
}
