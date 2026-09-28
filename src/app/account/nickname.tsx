import { NicknameEditScreen } from "@/features/account/ui/nickname-edit-screen";

/**
 * A2/C3: `/account/nickname`. Lives alongside the `(tabs)/account` group the
 * same way `groups/create.tsx` sits alongside `(tabs)/groups` -- a top-level
 * route segment is a sibling of the group, not a child of it, so this does
 * not collide with `(tabs)/account/index.tsx`'s `/account` route. Declared
 * as a root-Stack modal (title "닉네임 변경") in `src/app/_layout.tsx`, per
 * api_contracts.app_account.
 */
export default function NicknameRoute() {
  return <NicknameEditScreen />;
}
