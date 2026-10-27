import type { PropsWithChildren } from 'react';
import { palette } from '@/constants/design';

export function SafeScreen({ children }: PropsWithChildren) {
  return (
    <div style={{
      flex: 1,
      minHeight: 0,
      display: 'flex',
      flexDirection: 'column',
      backgroundColor: palette.background,
      paddingTop: 'env(safe-area-inset-top, 0px)',
      paddingLeft: 'env(safe-area-inset-left, 0px)',
      paddingRight: 'env(safe-area-inset-right, 0px)',
    }}>
      {children}
    </div>
  );
}
