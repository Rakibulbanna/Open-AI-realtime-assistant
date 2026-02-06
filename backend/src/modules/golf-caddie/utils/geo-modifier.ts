export const geoCreator = (data: { vectorGPSObject: any }) => {
  const engineData: any = {};
  const features = geoJSONModifier(data?.vectorGPSObject, engineData);

  return {
    type: "FeatureCollection",
    features,
    engineData,
  };
};

const geoJSONModifier = (
  api_data: any,
  engine_data: any,
  before_string?: string
): any[] => {
  return Object.entries(api_data)?.reduce((pv: any[], cv) => {
    const key: string = cv?.[0];
    const val: any = cv?.[1];

    if (
      typeof val?.Shapes === "object" &&
      "Shapes" in val &&
      val?.ShapeCount > 0
    ) {
      if (key === "Path" || key === "Centralpath" || key === "Creek") {
        val?.Shapes?.Shape?.forEach(
          (point_collection: { Points: string }, index: number) => {
            const coordinates = singleFeatureCreator(
              point_collection?.Points,
              "line"
            );
            if (key in engine_data) {
              engine_data[key].push(coordinates);
            } else {
              engine_data[key] = [coordinates];
            }
            pv.push({
              type: "Feature",
              properties: {
                type: key,
                index: index + 1,
                parent: before_string ?? "Common",
              },
              geometry: {
                type: "LineString",
                coordinates,
              },
            });
          }
        );
      } else if (
        key === "Tree" ||
        key === "Greencenter" ||
        key === "Teeboxcenter"
      ) {
        val?.Shapes?.Shape?.forEach(
          (point_collection: { Points: string }, index: number) => {
            const coordinates = singleFeatureCreator(
              point_collection?.Points,
              "point"
            );
            if (key in engine_data) {
              engine_data[key].push(coordinates);
            } else {
              engine_data[key] = [coordinates];
            }
            pv.push({
              type: "Feature",
              properties: {
                type: key,
                index: index + 1,
                parent: before_string ?? "Common",
              },
              geometry: {
                type: "Point",
                coordinates,
              },
            });
          }
        );
      } else if (
        key === "Water" ||
        key === "Sand" ||
        key === "Clubhouse" ||
        key === "Background" ||
        key === "Perimeter" ||
        key === "Teebox" ||
        key === "Bunker" ||
        key === "Fairway" ||
        key === "Green" ||
        key === "Bridge"
      ) {
        val?.Shapes?.Shape?.forEach(
          (point_collection: { Points: string }, index: number) => {
            const coordinates = singleFeatureCreator(
              point_collection?.Points,
              "polygon"
            );
            if (key in engine_data) {
              engine_data[key].push(coordinates);
            } else {
              engine_data[key] = [coordinates];
            }
            pv.push({
              type: "Feature",
              properties: {
                type: key,
                index: index + 1,
                parent: before_string ?? "Common",
              },
              geometry: {
                type: "Polygon",
                coordinates: [coordinates],
              },
            });
          }
        );
      }
    } else if (key === "Holes") {
      val?.Hole?.forEach((hole: any) => {
        engine_data[`Hole ${hole?.HoleNumber}`] = {};
        pv = [
          ...pv,
          ...geoJSONModifier(
            hole,
            engine_data[`Hole ${hole?.HoleNumber}`],
            `Hole ${hole?.HoleNumber}`
          ),
        ];
      });
    }
    return pv;
  }, []);
};

const singleFeatureCreator = (
  points: string,
  type: "point" | "line" | "polygon"
) => {
  let point_to_latlng: any = points?.split(",")?.map((latlng: string) =>
    latlng
      ?.trim()
      ?.split(" ")
      ?.map((cod: string) => Number(cod))
  );
  switch (type) {
    case "polygon":
      point_to_latlng.push(point_to_latlng?.[0]);
      break;
    case "point":
      point_to_latlng = point_to_latlng?.[0];
      break;
  }
  return point_to_latlng;
};
