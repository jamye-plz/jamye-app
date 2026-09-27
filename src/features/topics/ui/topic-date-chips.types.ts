export type TopicDateChipsProps = Readonly<{
  /** Dates that have at least one topic (`YYYY-MM-DD`, Asia/Seoul); `today` is
   * always shown even if it has no topics yet (T1). */
  dates: readonly string[];
  today: string;
  selected: string;
  onSelect: (date: string) => void;
  testID?: string;
}>;
