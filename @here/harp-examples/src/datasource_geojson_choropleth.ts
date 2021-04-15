/*
 * Copyright (C) 2019-2021 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */
import { Style, StyleSet, TextureCoordinateType, Theme } from "@here/harp-datasource-protocol";
import { DebugTileDataSource } from "@here/harp-debug-datasource";
import { GeoCoordinates, webMercatorTilingScheme } from "@here/harp-geoutils";
import { MapControls, MapControlsUI } from "@here/harp-map-controls";
import { CopyrightElementHandler, MapView } from "@here/harp-mapview";
import { GeoJsonDataProvider, VectorTileDataSource } from "@here/harp-vectortile-datasource";
import * as THREE from "three";

import { apikey } from "../config";

/**
 * This example demonstrates how to generate a heatmap-like [[StyleSet]] for a GeoJson. To do so,
 * each [[Style]] needs to define its own color shade, and they all need to be staggered on a
 * specific range of values. Here, the values are brought directly in the data of the GeoJson,
 * through the properties held in each feature. This GeoJson is a map of Italy, each feature
 * represents a region, and the properties bear the population density of that region. We can
 * narrow the `when` [[Expr]] condition of a [[Style]] to a value in a property, by simply writing
 * `propertyName` in the condition. The algorithm then reads:
 * ```typescript
 * [[include:geojson_heatmap1.ts]]
 * ```
 *
 * The algorithm loops through a range of values to create the [[Style]]s based on a range of
 * values, hence the variables in use. Externally it is wrapped in a more readable function where we
 * can simply describe the heatmap desired:
 * ```typescript
 * [[include:geojson_heatmap2.ts]]
 * ```
 *
 * Finally this [[StyleSet]] is assigned to the [[DataSource]]:
 * ```typescript
 * [[include:geojson_heatmap3.ts]]
 * ```
 */
export namespace GeoJsonHeatmapExample {
    document.body.innerHTML += `
        <style>
            #mapCanvas {
              top: 0;
            }
            #info{
                color: #fff;
                width: 80%;
                left: 50%;
                position: relative;
                margin: 10px 0 0 -40%;
                font-size: 15px;
            }
            @media screen and (max-width: 700px) {
                #info{
                    font-size:11px;
                }
            }
        </style>
        <p id=info></p>
    `;

    /**
     * Creates a new MapView for the HTMLCanvasElement of the given id.
     */
    function initializeBaseMap(id: string, theme: Theme): MapView {
        const canvas = document.getElementById(id) as HTMLCanvasElement;
        const mapView = new MapView({
            canvas,
            theme,
            addBackgroundDatasource: false
        });
        mapView.renderer.debug.checkShaderErrors = false;
        mapView.lookAt({
            target: new GeoCoordinates(42, 14),
            zoomLevel: 7,
            tilt: 0,
            heading: 0
        });

        const controls = new MapControls(mapView);

        // Add an UI.
        const ui = new MapControlsUI(controls);
        canvas.parentElement!.appendChild(ui.domElement);

        window.addEventListener("resize", () => {
            mapView.resize(window.innerWidth, window.innerHeight);
        });

        CopyrightElementHandler.install("copyrightNotice", mapView);

        const baseMapDataSource = new VectorTileDataSource({
            baseUrl: "https://vector.hereapi.com/v2/vectortiles/base/mc",
            authenticationCode: apikey
        });

        mapView.addDataSource(baseMapDataSource);

        return mapView;
    }

    // snippet:geojson_heatmap3.ts
    const customTheme = {
        extends: "resources/berlin_tilezen_night_reduced.json",
        styles: {
            geojson: [
                {
                    technique: "standard",
                    when: `$geometryType == 'polygon'`,
                    renderOrder: 0,
                    map: [
                        "get",
                        ["concat", "dynamic-texture-url", ["get", "id"]],
                        ["dynamic-properties"]
                    ],
                    mapProperties: {
                        flipY: true
                    },
                    transparent: true,
                    textureCoordinateType: TextureCoordinateType.FeatureSpace
                }
            ] as StyleSet
        }
    };
    // end:geojson_heatmap3.ts
    const baseMap = initializeBaseMap("mapCanvas", customTheme);

    const geoJsonDataProvider = new GeoJsonDataProvider("italy", {
        type: "FeatureCollection",
        features: [
            {
                id: "KLRKDk6pCr",
                type: "Feature",
                properties: {
                    id: 1,
                    bbox: [5.0, 40.0, 10.0, 46.0]
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [5.0, 40.0],
                            [10.0, 40.0],
                            [10.0, 46.0],
                            [5.0, 46.0],
                            [5.0, 40.0]
                        ]
                    ]
                }
            },
            {
                id: "caca",
                type: "Feature",
                properties: {
                    id: 2,
                    bbox: [10.0, 40.0, 15.0, 46.0]
                },
                geometry: {
                    type: "Polygon",
                    coordinates: [
                        [
                            [10.0, 40.0],
                            [15.0, 40.0],
                            [15.0, 46.0],
                            [10.0, 46.0],
                            [10.0, 40.0]
                        ]
                    ]
                }
            }
        ]
    });
    const geoJsonDataSource = new VectorTileDataSource({
        dataProvider: geoJsonDataProvider,
        styleSetName: "geojson",
        name: "radar",
        addGroundPlane: false
    });
    baseMap.addDataSource(geoJsonDataSource);

    // const debugDataSource = new DebugTileDataSource(webMercatorTilingScheme, "debug", 20);
    // baseMap.addDataSource(debugDataSource);

    baseMap.setDynamicProperty("dynamic-texture-url1", "resources/radar0.png");
    baseMap.setDynamicProperty("dynamic-texture-url2", "resources/tree-01.png");
    let randarIdx = 0;
    let treeIdx = 1;
    setInterval(function () {
        randarIdx = randarIdx < 5 ? ++randarIdx : 0;
        baseMap.setDynamicProperty("dynamic-texture-url1", `resources/radar${randarIdx}.png`);
        treeIdx = treeIdx < 2 ? ++treeIdx : 1;
        baseMap.setDynamicProperty("dynamic-texture-url2", `resources/tree-0${treeIdx}.png`);
    }, 250);

    const infoElement = document.getElementById("info") as HTMLParagraphElement;
    infoElement.innerHTML =
        `This choropleth shows how to use custom styling to highlight specific features in the` +
        ` map. Here some height is given to the extruded polygons directly in the GeoJSON, ` +
        `whereas the color comes from the population density given in the properties.`;
}
