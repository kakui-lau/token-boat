type ScrollMetrics = {
  clientHeight: number;
  scrollHeight: number;
  scrollTop: number;
};

const scrollEndTolerance = 8;

export function modelDialogHasMoreContent(metrics: ScrollMetrics): boolean {
  return metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop > scrollEndTolerance;
}
