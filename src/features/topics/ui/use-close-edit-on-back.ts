/**
 * iOS/web: there is no system back button; the edit sheet closes from its
 * toolbar. Android resolves to `use-close-edit-on-back.android.ts`.
 */
export function useCloseEditOnBack(_active: boolean, _onBack: () => void) {}
