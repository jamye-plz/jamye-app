export type LoadSentinelProps = Readonly<{
  /** While true, shows a small spinner and never calls `onVisible`. */
  isLoading?: boolean;
  /**
   * Called once when the sentinel becomes visible (a rising edge), and not
   * again until it leaves and re-enters view — so placing one sentinel at
   * the end of a list and appending rows on each call never double-fires for
   * the same cursor.
   */
  onVisible: () => void;
  testID?: string;
}>;
