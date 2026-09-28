import { MediaViewerScreen } from "@/features/media/ui/media-viewer-screen";

/**
 * R3 full-screen attachment viewer. Thin route: `presentation:
 * "fullScreenModal"` is declared once on the root Stack in
 * `src/app/_layout.tsx` (not here) so it also applies when this route is
 * reached other than through `openMediaViewer`'s own `router.push`. All
 * behavior lives in `media-viewer-screen.tsx`, which reads its attachments
 * from the memory store (`media-viewer-store.ts`), not from route params.
 */
export default function MediaViewerRoute() {
  return <MediaViewerScreen />;
}
