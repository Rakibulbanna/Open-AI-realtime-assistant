import { PositionDto } from "../dto/shot-recommendation.dto";

/**
 * Calculate the direction (bearing) from player position to hole position
 * @param playerPosition Starting position
 * @param holePosition Target position
 * @returns Direction in degrees (0-360, where 0 is North)
 */
export function calculateShotDirection(
   playerPosition: PositionDto,
   holePosition: PositionDto,
): number {
   const lat1 = toRadians(playerPosition.lat);
   const lat2 = toRadians(holePosition.lat);
   const dLng = toRadians(holePosition.lng - playerPosition.lng);

   const y = Math.sin(dLng) * Math.cos(lat2);
   const x =
      Math.cos(lat1) * Math.sin(lat2) -
      Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);

   let bearing = Math.atan2(y, x);
   bearing = toDegrees(bearing);
   bearing = (bearing + 360) % 360; // Normalize to 0-360

   return bearing;
}

function toRadians(degrees: number): number {
   return degrees * (Math.PI / 180);
}

function toDegrees(radians: number): number {
   return radians * (180 / Math.PI);
}

