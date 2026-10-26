/** Continuous purple-to-teal scale, shared by detail and thumbnail. */
export function probabilityColor(probability: number): string {
  const low = [205, 188, 230], high = [74, 165, 152];
  return `rgb(${low.map((channel, index) => Math.round(channel + (high[index] - channel) * probability)).join(",")})`;
}
