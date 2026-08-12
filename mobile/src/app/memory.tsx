import { useCallback } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { MemoryReader } from '@/components/memory-cards';
import { useStudyCards } from '@/hooks/use-study-cards';

export default function MemoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ cardId?: string | string[] }>();
  const { payload } = useStudyCards();
  const cardId = Array.isArray(params.cardId) ? params.cardId[0] : params.cardId;
  const close = useCallback(() => router.back(), [router]);

  return <MemoryReader cards={payload.cards} initialCardId={cardId} onClose={close} />;
}
