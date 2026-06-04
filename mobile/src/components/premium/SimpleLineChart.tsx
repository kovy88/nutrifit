import type { MiniTrendChartProps } from '../MiniTrendChart';
import { MiniTrendChart } from '../MiniTrendChart';

export function SimpleLineChart(props: MiniTrendChartProps) {
  return <MiniTrendChart height={props.height ?? 84} {...props} />;
}
