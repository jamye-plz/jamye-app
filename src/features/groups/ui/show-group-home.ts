import type { ImperativeRouter } from "expo-router";

/**
 * Leaves the create / invite-join form for the group's home with the group
 * list beneath it, exactly as if the group had been opened from the list.
 * `dismissTo` closes the form and pushes the home onto the groups tab's
 * existing stack; when no tab bar sits under the form (an invite link opened
 * it as the first screen), `withAnchor` seeds the new groups stack with its
 * first route, the list (a static `index` always sorts first). A `replace`
 * used to swap the form for a second tab navigator whose groups stack held
 * only the home: no back button, and no way back to the list.
 */
export function showGroupHome(
  router: Pick<ImperativeRouter, "dismissTo">,
  groupId: string,
): void {
  router.dismissTo(
    { params: { groupId }, pathname: "/groups/[groupId]" },
    { withAnchor: true },
  );
}
