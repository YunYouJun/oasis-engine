import { Camera } from "../Camera";
import { Engine } from "../Engine";
import { Layer } from "../Layer";
import { Material } from "../material/Material";
import { Shader } from "../shader";
import { ShaderMacroCollection } from "../shader/ShaderMacroCollection";
import { MeshRenderElement } from "./MeshRenderElement";
import { RenderElement } from "./RenderElement";
import { SpriteBatcher } from "./SpriteBatcher";
import { SpriteElement } from "./SpriteElement";

/**
 * Render queue.
 */
export class RenderQueue {
  /**
   * @internal
   */
  static _compareFromNearToFar(a: RenderElement, b: RenderElement): number {
    return a.component.priority - b.component.priority || a.component._distanceForSort - b.component._distanceForSort;
  }

  /**
   * @internal
   */
  static _compareFromFarToNear(a: RenderElement, b: RenderElement): number {
    return a.component.priority - b.component.priority || b.component._distanceForSort - a.component._distanceForSort;
  }

  readonly items: RenderElement[] = [];
  private _spriteBatcher: SpriteBatcher;

  constructor(engine: Engine) {
    this._spriteBatcher = new SpriteBatcher(engine);
  }

  /**
   * Push a render element.
   */
  pushPrimitive(element: RenderElement): void {
    this.items.push(element);
  }

  render(camera: Camera, replaceMaterial: Material, mask: Layer, customShader: Shader): void {
    const items = this.items;
    if (items.length === 0) {
      return;
    }

    const { engine, scene } = camera;
    const renderCount = engine._renderCount;
    const rhi = engine._hardwareRenderer;
    const sceneData = scene.shaderData;
    const cameraData = camera.shaderData;

    for (let i = 0, n = items.length; i < n; i++) {
      const item = items[i];
      const renderPassFlag = item.component.entity.layer;

      if (!(renderPassFlag & mask)) {
        continue;
      }

      if (!!(item as MeshRenderElement).mesh) {
        this._spriteBatcher.flush(camera, replaceMaterial);

        const compileMacros = Shader._compileMacros;
        const element = <MeshRenderElement>item;
        const renderer = element.component;
        const material = element.material.destroyed ? engine._magentaMaterial : element.material;
        const rendererData = renderer.shaderData;
        const materialData = material.shaderData;

        // @todo: temporary solution
        (replaceMaterial || material)._preRender(element);

        // union render global macro and material self macro.
        ShaderMacroCollection.unionCollection(
          renderer._globalShaderMacro,
          materialData._macroCollection,
          compileMacros
        );

        // @todo: temporary solution
        const program = (
          customShader?.passes[0] ||
          replaceMaterial?.shader.passes[0] ||
          element.shaderPass
        )._getShaderProgram(engine, compileMacros);

        if (!program.isValid) {
          continue;
        }

        const switchProgram = program.bind();
        const switchRenderCount = renderCount !== program._uploadRenderCount;

        if (switchRenderCount) {
          program.groupingOtherUniformBlock();
          program.uploadAll(program.sceneUniformBlock, sceneData);
          program.uploadAll(program.cameraUniformBlock, cameraData);
          program.uploadAll(program.rendererUniformBlock, rendererData);
          program.uploadAll(program.materialUniformBlock, materialData);
          // UnGroup textures should upload default value, texture uint maybe change by logic of texture bind.
          program.uploadUnGroupTextures();
          program._uploadScene = scene;
          program._uploadCamera = camera;
          program._uploadRenderer = renderer;
          program._uploadMaterial = material;
          program._uploadRenderCount = renderCount;
        } else {
          if (program._uploadScene !== scene) {
            program.uploadAll(program.sceneUniformBlock, sceneData);
            program._uploadScene = scene;
          } else if (switchProgram) {
            program.uploadTextures(program.sceneUniformBlock, sceneData);
          }

          if (program._uploadCamera !== camera) {
            program.uploadAll(program.cameraUniformBlock, cameraData);
            program._uploadCamera = camera;
          } else if (switchProgram) {
            program.uploadTextures(program.cameraUniformBlock, cameraData);
          }

          if (program._uploadRenderer !== renderer) {
            program.uploadAll(program.rendererUniformBlock, rendererData);
            program._uploadRenderer = renderer;
          } else if (switchProgram) {
            program.uploadTextures(program.rendererUniformBlock, rendererData);
          }

          if (program._uploadMaterial !== material) {
            program.uploadAll(program.materialUniformBlock, materialData);
            program._uploadMaterial = material;
          } else if (switchProgram) {
            program.uploadTextures(program.materialUniformBlock, materialData);
          }

          // We only consider switchProgram case, because UnGroup texture's value is always default.
          if (switchProgram) {
            program.uploadUnGroupTextures();
          }
        }
        element.renderState._apply(engine, renderer.entity.transform._isFrontFaceInvert());

        rhi.drawPrimitive(element.mesh, element.subMesh, program);
      } else {
        const spriteElement = <SpriteElement>item;
        this._spriteBatcher.drawElement(spriteElement, camera, replaceMaterial);
      }
    }

    this._spriteBatcher.flush(camera, replaceMaterial);
  }

  /**
   * Clear collection.
   */
  clear(): void {
    this.items.length = 0;
    this._spriteBatcher.clear();
  }

  /**
   * Destroy internal resources.
   */
  destroy(): void {
    this._spriteBatcher.destroy();
    this._spriteBatcher = null;
  }

  /**
   * Sort the elements.
   */
  sort(compareFunc: Function): void {
    this._quickSort(this.items, 0, this.items.length, compareFunc);
  }

  /**
   * @remarks
   * Modified based on v8.
   * https://github.com/v8/v8/blob/7.2-lkgr/src/js/array.js
   */
  private _quickSort<T>(a: T[], from: number, to: number, compareFunc: Function): void {
    while (true) {
      // Insertion sort is faster for short arrays.
      if (to - from <= 10) {
        this._insertionSort(a, from, to, compareFunc);
        return;
      }
      const third_index = (from + to) >> 1;
      // Find a pivot as the median of first, last and middle element.
      let v0 = a[from];
      let v1 = a[to - 1];
      let v2 = a[third_index];
      const c01 = compareFunc(v0, v1);
      if (c01 > 0) {
        // v1 < v0, so swap them.
        const tmp = v0;
        v0 = v1;
        v1 = tmp;
      } // v0 <= v1.
      const c02 = compareFunc(v0, v2);
      if (c02 >= 0) {
        // v2 <= v0 <= v1.
        const tmp = v0;
        v0 = v2;
        v2 = v1;
        v1 = tmp;
      } else {
        // v0 <= v1 && v0 < v2
        const c12 = compareFunc(v1, v2);
        if (c12 > 0) {
          // v0 <= v2 < v1
          const tmp = v1;
          v1 = v2;
          v2 = tmp;
        }
      }
      // v0 <= v1 <= v2
      a[from] = v0;
      a[to - 1] = v2;
      const pivot = v1;
      let low_end = from + 1; // Upper bound of elements lower than pivot.
      let high_start = to - 1; // Lower bound of elements greater than pivot.
      a[third_index] = a[low_end];
      a[low_end] = pivot;

      // From low_end to i are elements equal to pivot.
      // From i to high_start are elements that haven't been compared yet.
      partition: for (let i = low_end + 1; i < high_start; i++) {
        let element = a[i];
        let order = compareFunc(element, pivot);
        if (order < 0) {
          a[i] = a[low_end];
          a[low_end] = element;
          low_end++;
        } else if (order > 0) {
          do {
            high_start--;
            if (high_start == i) break partition;
            const top_elem = a[high_start];
            order = compareFunc(top_elem, pivot);
          } while (order > 0);
          a[i] = a[high_start];
          a[high_start] = element;
          if (order < 0) {
            element = a[i];
            a[i] = a[low_end];
            a[low_end] = element;
            low_end++;
          }
        }
      }
      if (to - high_start < low_end - from) {
        this._quickSort(a, high_start, to, compareFunc);
        to = low_end;
      } else {
        this._quickSort(a, from, low_end, compareFunc);
        from = high_start;
      }
    }
  }

  private _insertionSort<T>(a: T[], from: number, to: number, compareFunc: Function): void {
    for (let i = from + 1; i < to; i++) {
      let j;
      const element = a[i];
      for (j = i - 1; j >= from; j--) {
        const tmp = a[j];
        const order = compareFunc(tmp, element);
        if (order > 0) {
          a[j + 1] = tmp;
        } else {
          break;
        }
      }
      a[j + 1] = element;
    }
  }
}
