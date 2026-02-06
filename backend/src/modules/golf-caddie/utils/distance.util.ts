/**
 * Calculate the distance between two geographic coordinates using the Haversine formula
 * @param lat1 Latitude of first point
 * @param lng1 Longitude of first point
 * @param lat2 Latitude of second point
 * @param lng2 Longitude of second point
 * @returns Distance in meters
 */
export function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
   const R = 6371000; // Earth's radius in meters
   const dLat = toRadians(lat2 - lat1);
   const dLng = toRadians(lng2 - lng1);
   /* Haversine formula to calculate the distance between two points on the Earth's surface
      a = sin²(dLat/2) + cos(lat1)·cos(lat2)·sin²(dLng/2)
      c = 2·atan2(√a, √(1-a))
      distance = R·c
   */
   const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
   const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
   return R * c;
}

function toRadians(degrees: number): number {
   return degrees * (Math.PI / 180);
}
