import { WindImpact } from "../dto/shot-recommendation.dto";

/**
 * Calculate wind impact on shot distance
 * @param windSpeed_mps Wind speed in meters per second
 * @param windDirection_deg Wind direction in degrees (0-360)
 * @param shotDirection_deg Direction of the shot in degrees (0-360)
 * @returns Object with adjusted distance multiplier and impact level
 */
export function calculateWindImpact(
   windSpeed_mps: number,
   windDirection_deg: number,
   shotDirection_deg: number,
): { distanceMultiplier: number; impactLevel: WindImpact } {
   // Calculate the angle difference between wind and shot direction
   let angleDiff = Math.abs(windDirection_deg - shotDirection_deg);

   // Normalize to 0-180 degrees
   if (angleDiff > 180) {
      angleDiff = 360 - angleDiff;
   }

   // Convert wind speed from m/s to km/h for easier calculation
   const windSpeed_kmh = windSpeed_mps * 3.6;

   // Calculate wind component (1.0 = headwind, -1.0 = tailwind, 0 = crosswind)
   const windComponent = Math.cos(toRadians(angleDiff));

   // Determine impact level based on wind speed
   let impactLevel: WindImpact;
   if (windSpeed_kmh < 15) {
      impactLevel = WindImpact.LOW;
   } else if (windSpeed_kmh < 30) {
      impactLevel = WindImpact.MEDIUM;
   } else {
      impactLevel = WindImpact.HIGH;
   }

   // Calculate distance adjustment
   // Headwind (windComponent > 0) reduces distance
   // Tailwind (windComponent < 0) increases distance
   // Crosswind (windComponent ≈ 0) has minimal effect
   const windEffect = windComponent * (windSpeed_kmh / 100); // 1% per km/h for headwind/tailwind

   // Distance multiplier: headwind reduces, tailwind increases
   const distanceMultiplier = 1 - windEffect;

   return {
      distanceMultiplier: Math.max(0.7, Math.min(1.3, distanceMultiplier)), // Clamp between 0.7 and 1.3
      impactLevel,
   };
}

/**
 * Calculate wind penalty for success probability
 * Wind always reduces success probability
 */
export function calculateWindPenalty(
   windSpeed_mps: number,
   windDirection_deg: number,
   shotDirection_deg: number,
): number {
   const { impactLevel } = calculateWindImpact(windSpeed_mps, windDirection_deg, shotDirection_deg);

   // Wind always reduces success probability
   switch (impactLevel) {
      case WindImpact.LOW:
         return 2; // 2% penalty
      case WindImpact.MEDIUM:
         return 5; // 5% penalty
      case WindImpact.HIGH:
         return 10; // 10% penalty
   }
}

function toRadians(degrees: number): number {
   return degrees * (Math.PI / 180);
}
