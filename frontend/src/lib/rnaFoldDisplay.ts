/** Continuous light-to-dark blue scale, shared by detail and thumbnail. */
export function probabilityColor(probability: number): string {
  const low = [191, 216, 233], high = [29, 108, 155];
  return `rgb(${low.map((channel, index) => Math.round(channel + (high[index] - channel) * probability)).join(",")})`;
}

/** Rigid display rotation only: keep the RNAfold geometry, bases and pairing intact. */
export function orientThumbnailCoordinates(coordinates: readonly { x: number; y: number }[]): { x: number; y: number }[] {
  if (!coordinates.length) return [];
  const center = coordinates.reduce((sum, p) => ({ x: sum.x + p.x / coordinates.length, y: sum.y + p.y / coordinates.length }), { x: 0, y: 0 });
  const centered = coordinates.map(p => ({ x: p.x - center.x, y: p.y - center.y }));
  const covariance = centered.reduce((sum, p) => ({ xx: sum.xx + p.x * p.x, yy: sum.yy + p.y * p.y, xy: sum.xy + p.x * p.y }), { xx: 0, yy: 0, xy: 0 });
  const angle = .5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
  const cos = Math.cos(angle), sin = Math.sin(angle);
  return centered.map(p => ({ x: p.x * cos + p.y * sin, y: -p.x * sin + p.y * cos }));
}
