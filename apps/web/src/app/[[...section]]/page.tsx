import { Portal } from '@/components/portal';
import { Suspense } from 'react';
export default function Page() {
  return (
    <Suspense>
      <Portal />
    </Suspense>
  );
}
