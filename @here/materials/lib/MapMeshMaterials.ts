/*
 * Copyright (C) 2017-2018 HERE Europe B.V.
 * Licensed under Apache 2.0, see full license in LICENSE
 * SPDX-License-Identifier: Apache-2.0
 */

import { applyMixinsWithoutProperties } from "@here/utils";

import * as THREE from "three";

import fadingShaderChunk from "@here/materials/lib/ShaderChunks/FadingChunks";

/**
 * The MapMeshMaterials [[MapMeshBasicMaterial]] and [[MapMeshStandardMaterial]] are the standard
 * [[THREE.MeshBasicMaterial]] and [[THREE.MeshStandardMaterial]], with the addition functionality
 * of fading out the geometry between a fadeNear and fadeFar value.
 *
 * The implementation is designed around a mixin class [[FadingFeatureMixin]], which requires
 * a bit of care when adding the FadingFeature to the existing mesh classes, but it is safe to use
 * and also reduces code duplication.
 */

/**
 * Parameters used when constructing a new implementor of [[FadingFeature]].
 */
export interface FadingFeatureParameters {
    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects start fading out.
     */
    fadeNear?: number;

    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects are transparent.
     */
    fadeFar?: number;
}

/**
 * Used internally.
 *
 * @hidden
 */
interface UnifomType {
    value: any;
}

/**
 * Used internally.
 *
 * @hidden
 */
interface UniformsType {
    [index: string]: UnifomType;
}

/**
 * Translates a linear distance value [0..1], where 1 is the distance to the far plane, into
 * [0..cameraFar].
 *
 * Copy from MapViewUtils, since it cannot be accessed here because of circular dependencies.
 *
 * @param distance Distance from the camera (range: [0, 1]).
 * @param camera Camera applying the perspective projection.
 */
function cameraToWorldDistance(distance: number, camera: THREE.Camera): number {
    const perspCam = camera as THREE.PerspectiveCamera;
    return distance * perspCam.far;
}

/**
 * Material properties used from THREE, which may not be defined in the type.
 */
export interface HiddenThreeJSMaterialProperties {
    needsUpdate?: boolean;

    /**
     * Used internally for material shader defines.
     */
    defines?: any;

    /**
     * Hidden ThreeJS value that is made public here. Required to add new uniforms to subclasses of
     * [[THREE.MeshBasicMaterial]]/[[THREE.MeshStandardMaterial]], basically all materials that are
     * not THREE.ShaderMaterial.
     */
    uniformsNeedUpdate?: boolean;

    /**
     * Available in all materials in ThreeJS.
     */
    transparent?: boolean;
}

/**
 * Base interface for all objects that should fade in the distance. The implemntation of the actual
 * FadingFeature is done with the help of the mixon class [[FadingFeatureMixin]] and a set of
 * supporting functions in the namespace of the same name.
 */
export interface FadingFeature extends HiddenThreeJSMaterialProperties {
    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects start fading out.
     */
    fadeNear?: number;

    /**
     * Distance to the camera (range: `[0.0, 1.0]`) from which the objects are transparent. A value
     * of <= 0.0 disables fading.
     */
    fadeFar?: number;
}

/**
 * Namespace with support functions for implementors of `FadingFeature`.
 */
export namespace FadingFeature {
    export const DEFAULT_FADE_NEAR: number = -1.0;
    export const DEFAULT_FADE_FAR: number = -1.0;

    /**
     * Patch the THREE.ShaderChunk on first call with some extra shader chunks.
     */
    export function patchGlobalShaderChunks() {
        if (THREE.ShaderChunk.fading_pars_vertex === undefined) {
            Object.assign(THREE.ShaderChunk, fadingShaderChunk);
        }
    }

    /**
     * Update the internals of the `FadingFeature` depending on the value of [[fadeNear]]. The
     * fading feature will be disabled if fadeFar <= 0.0.
     *
     * @param fadingMaterial FadingFeature
     */
    export function updateDistanceFadeFeature(fadingMaterial: FadingFeature): void {
        fadingMaterial.needsUpdate = true;

        if (fadingMaterial.defines === undefined) {
            fadingMaterial.defines = {};
        }

        if (fadingMaterial.fadeFar !== undefined && fadingMaterial.fadeFar > 0.0) {
            // Add this define to differentiate it internally from other MeshBasicMaterial
            fadingMaterial.defines.FADING_MATERIAL = "";
        }
    }

    /**
     * Special function to insert shader includes after another shader include.
     *
     * @param shaderContent Original string.
     * @param shaderName String to append to.
     * @param insertedShaderName String to append after string `shaderA`.
     * @param addTab If `true`, a tab character will be inserted before `shaderB`.
     */
    export function insertShaderInclude(
        shaderContent: string,
        shaderName: string,
        insertedShaderName: string,
        addTab?: boolean
    ): string {
        const tabChar = addTab === true ? "\t" : "";

        const result = shaderContent.replace(
            `#include <${shaderName}>`,
            `
#include <${shaderName}>
// << Patched fading shader START >>
${tabChar}#include <${insertedShaderName}>
// << Patched fading shader END >>
`
        );
        return result;
    }

    /**
     * This function should be called on implementors of FadingFeature in the `onBeforeCompile`
     * callback of that material. It adds the required code to the shaders and declares the new
     * uniforms that control fading based on view distance.
     *
     * @param fadingMaterial Material to add uniforms to.
     * @param shader [[THREE.WebGLShader]] containing the vertex and fragment shaders to add the
     *                  special includes to.
     */
    export function onBeforeCompile(fadingMaterial: FadingFeature, shader: any) {
        if (fadingMaterial.fadeFar === undefined || fadingMaterial.fadeFar <= 0.0) {
            return;
        }
        // The vertex and fragment shaders have been constructed dynamically. The uniforms and
        // the shader includes are now appended to them.
        //
        // The object "defines" are not available for this material, so the fading shader chunks
        // have the #ifdefs commented out.

        // Create the uniforms for the shader (if not already existing), and add the new uniforms
        // to it:
        const uniforms = shader.uniforms as UniformsType;
        uniforms.fadeNear = { value: fadingMaterial.fadeNear };
        uniforms.fadeFar = { value: fadingMaterial.fadeFar };

        // Append the new fading shader cod directly after the fog code. This is done by adding an
        // include directive for the fading code.
        shader.vertexShader = FadingFeature.insertShaderInclude(
            shader.vertexShader,
            "fog_pars_vertex",
            "fading_pars_vertex"
        );

        shader.vertexShader = FadingFeature.insertShaderInclude(
            shader.vertexShader,
            "fog_vertex",
            "fading_vertex",
            true
        );

        shader.fragmentShader = FadingFeature.insertShaderInclude(
            shader.fragmentShader,
            "fog_pars_fragment",
            "fading_pars_fragment"
        );

        shader.fragmentShader = FadingFeature.insertShaderInclude(
            shader.fragmentShader,
            "fog_fragment",
            "fading_fragment",
            true
        );
    }

    /**
     * As threejs is rendering the transparent objects last (internally), regardless of their
     * renderOrder value, we set the transparent value to false in the [[onAfterRenderCall]]. In
     * [[onBeforeRender]], the function [[calculateDepthFromCameraDistance]] sets it to true if the
     * fade distance value is less than 1.
     *
     * @param object [[THREE.Object3D]] to prepare for rendering.
     * @param fadeNear The fadeNear value to set in the material.
     * @param fadeFar The fadeFar value to set in the material.
     * @param forceMaterialToTransparent If `true`, the material will be forced to render with
     *          blending set to `true`. May be `false` if the material is known to be transparent
     *          anyway.
     * @param updateUniforms If `true`, the fading uniforms are set. Not rquired if material is
     *          handling the uniforms already, like in a [[THREE.ShaderMaterial]].
     * @param additionalCallback If defined, this function will be called before the function will
     *          return.
     */
    export function addRenderHelper(
        object: THREE.Object3D,
        fadeNear: number | undefined,
        fadeFar: number | undefined,
        forceMaterialToTransparent: boolean,
        updateUniforms: boolean,
        additionalCallback?: (
            renderer: THREE.WebGLRenderer,
            material: THREE.Material & FadingFeature
        ) => void
    ) {
        // tslint:disable-next-line:no-unused-variable
        object.onBeforeRender = (
            renderer,
            scene,
            camera,
            geom,
            material: THREE.Material & FadingFeature
        ) => {
            if (forceMaterialToTransparent) {
                material.transparent = true;
            }
            const fadingMaterial = material as FadingFeature;

            fadingMaterial.fadeNear =
                fadeNear === undefined
                    ? FadingFeature.DEFAULT_FADE_NEAR
                    : cameraToWorldDistance(fadeNear, camera);

            fadingMaterial.fadeFar =
                fadeFar === undefined
                    ? FadingFeature.DEFAULT_FADE_FAR
                    : cameraToWorldDistance(fadeFar, camera);

            if (updateUniforms) {
                const properties = renderer.properties.get(material);

                if (properties.shader !== undefined) {
                    properties.shader.uniforms.fadeNear.value = fadingMaterial.fadeNear;
                    properties.shader.uniforms.fadeFar.value = fadingMaterial.fadeFar;
                    fadingMaterial.uniformsNeedUpdate = true;
                }
            }

            if (additionalCallback !== undefined) {
                additionalCallback(renderer, material);
            }
        };

        if (forceMaterialToTransparent) {
            object.onAfterRender = (renderer, scene, camera, geom, material) => {
                material.transparent = false;
            };
        }
    }
}

/**
 * Mixin class for extended THREE materials. Adds new properties required for `fadeNear` and
 * `fadeFar`. Thre is some special handling for the fadeNear/fadeFar properties, which get some
 * setters and getters in a way that works well with the mixin.
 *
 * @see [[Tile#addRenderHelper]]
 */
export class FadingFeatureMixin implements FadingFeature {
    needsUpdate?: boolean;
    uniformsNeedUpdate?: boolean;
    private m_fadeNear: number = FadingFeature.DEFAULT_FADE_NEAR;
    private m_fadeFar: number = FadingFeature.DEFAULT_FADE_FAR;

    /**
     * @see [[FadingFeature#fadeNear]]
     */
    protected getFadeNear(): number {
        return this.m_fadeNear;
    }
    /**
     * @see [[FadingFeature#fadeNear]]
     */
    protected setFadeNear(value: number) {
        this.needsUpdate = this.needsUpdate || value !== this.m_fadeNear;
        this.m_fadeNear = value;
        if (this.needsUpdate) {
            FadingFeature.updateDistanceFadeFeature(this);
        }
    }

    /**
     * @see [[FadingFeature#fadeFar]]
     */
    protected getFadeFar(): number {
        return this.m_fadeFar;
    }
    /**
     * @see [[FadingFeature#fadeFar]]
     */
    protected setFadeFar(value: number) {
        this.needsUpdate = this.needsUpdate || value !== this.m_fadeFar;
        this.m_fadeFar = value;
        if (this.needsUpdate) {
            FadingFeature.updateDistanceFadeFeature(this);
        }
    }

    /**
     * The mixin classes should call this method to register the properties [[fadeNear]] and
     * [[fadeFar]].
     */
    protected addFadingProperties(): void {
        Object.defineProperty(this, "fadeNear", {
            get: () => {
                return this.getFadeNear();
            },
            set: val => {
                this.setFadeNear(val);
            }
        });
        Object.defineProperty(this, "fadeFar", {
            get: () => {
                return this.getFadeFar();
            },
            set: val => {
                this.setFadeFar(val);
            }
        });
    }

    /**
     * Apply the fadeNear/fadeFar values from the parameters to the respective properties.
     *
     * @param params `FadingMeshBasicMaterial` parameters.
     */
    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // Apply initial parameter values.
        if (params !== undefined) {
            if (params.fadeNear !== undefined) {
                this.setFadeNear(params.fadeNear);
            }
            if (params.fadeFar !== undefined) {
                this.setFadeFar(params.fadeFar);
            }
        }

        (this as any).onBeforeCompile = (shader: any) => {
            FadingFeature.onBeforeCompile(this, shader);
        };
    }

    /**
     * Copy fadeNear/fadeFar values from other FadingFeature.
     *
     * @param source The material to copy property values from.
     */
    protected copyFadingParameters(source: FadingFeature) {
        this.setFadeNear(
            source.fadeNear === undefined ? FadingFeature.DEFAULT_FADE_NEAR : source.fadeNear
        );
        this.setFadeFar(
            source.fadeFar === undefined ? FadingFeature.DEFAULT_FADE_FAR : source.fadeFar
        );
        return this;
    }
}

/**
 * Subclass of [[THREE.MeshBasicMaterial]]. Adds new properties required for [[fadeNear]] and
 * [[fadeFar]]. In addition to the new properties (which update their respective uniforms), it is
 * also required to update the material in their objects [[onBeforeRender]] and [[OnAfterRender]]
 * calls, where their flag [[transparent]] is set and the internal fadeNear/fadeFar values are
 * updated to world space distances.
 *
 * @see [[Tile#addRenderHelper]]
 */
export class MapMeshBasicMaterial extends THREE.MeshBasicMaterial implements FadingFeature {
    uniformsNeedUpdate?: boolean;

    /**
     * Constructs a new `FadingMeshBasicMaterial`.
     *
     * @param params `FadingMeshBasicMaterial` parameters.
     */
    constructor(params?: THREE.MeshBasicMaterialParameters & FadingFeatureParameters) {
        super(params);

        FadingFeature.patchGlobalShaderChunks();

        this.addFadingProperties();
        this.applyFadingParameters(params);
    }

    clone(): this {
        return new MapMeshBasicMaterial().copy(this);
    }

    copy(source: this): any {
        super.copy(source);
        this.copyFadingParameters(source);
        return this;
    }

    // Only here to make the compiler happy, these methods will be overriden: The actual
    // implementations are those in [[FadingFeatureMixin]], see below:
    //
    // applyMixinsWithoutProperties(FadingMeshBasicMaterial, [FadingFeatureMixin]);
    //
    // Mixin declarations start ---------------------------------------------------------

    get fadeNear(): number {
        return FadingFeature.DEFAULT_FADE_NEAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeNear(value: number) {
        // to be overridden
    }

    get fadeFar(): number {
        return FadingFeature.DEFAULT_FADE_FAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeFar(value: number) {
        // to be overridden
    }

    protected addFadingProperties(): void {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected copyFadingParameters(source: FadingFeature) {
        // to be overridden
    }
    // Mixin declarations end -----------------------------------------------------------
}

/**
 * Subclass of THREE.MeshStandardMaterial. Adds new properties required for `fadeNear` and
 * `fadeFar`. In addition to the new properties (which fill respective uniforms), it is also
 * required to update the material in their objects `onBeforeRender` and `OnAfterRender` calls,
 * where their flag `transparent` is set and the internal fadeNear/fadeFar values are updated to
 * world space distances.
 *
 * @see [[Tile#addRenderHelper]]
 */
export class MapMeshStandardMaterial extends THREE.MeshStandardMaterial implements FadingFeature {
    uniformsNeedUpdate?: boolean;

    /**
     * Constructs a new `FadingMeshStandardMaterial`.
     *
     * @param params `FadingMeshStandardMaterial` parameters.
     */
    constructor(params?: THREE.MeshStandardMaterialParameters & FadingFeatureParameters) {
        super(params);

        FadingFeature.patchGlobalShaderChunks();

        this.addFadingProperties();
        this.applyFadingParameters(params);
    }

    clone(): this {
        return new MapMeshStandardMaterial().copy(this);
    }

    copy(source: this): any {
        super.copy(source);
        this.copyFadingParameters(source);
        return this;
    }

    // Only here to make the compiler happy, these methods will be overriden: The actual
    // implementations are those in [[FadingFeatureMixin]], see below:
    //
    // applyMixinsWithoutProperties(FadingMeshBasicMaterial, [FadingFeatureMixin]);
    //
    // Mixin declarations start ---------------------------------------------------------

    get fadeNear(): number {
        return FadingFeature.DEFAULT_FADE_NEAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeNear(value: number) {
        // to be overridden
    }

    get fadeFar(): number {
        return FadingFeature.DEFAULT_FADE_FAR;
    }
    // tslint:disable-next-line:no-unused-variable
    set fadeFar(value: number) {
        // to be overridden
    }

    protected addFadingProperties(): void {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected applyFadingParameters(params?: FadingFeatureParameters) {
        // to be overridden
    }

    // tslint:disable-next-line:no-unused-variable
    protected copyFadingParameters(source: FadingFeature) {
        // to be overridden
    }
    // Mixin declarations end -----------------------------------------------------------
}

/**
 * Finish the classes MapMeshBasicMaterial and MapMeshStandardMaterial by assigning them the actual
 * implementations of the mixed in functions.
 */
applyMixinsWithoutProperties(MapMeshBasicMaterial, [FadingFeatureMixin]);
applyMixinsWithoutProperties(MapMeshStandardMaterial, [FadingFeatureMixin]);
