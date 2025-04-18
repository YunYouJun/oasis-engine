import { request } from "@oasis-engine/core";
import { GLTFUtil } from "../GLTFUtil";
import { IBuffer, IGLTF } from "../Schema";
import { Parser } from "./Parser";
import { ParserContext } from "./ParserContext";

export class BufferParser extends Parser {
  parse(context: ParserContext): Promise<void> {
    const glTFResource = context.glTFResource;
    const { url } = glTFResource;

    if (this._isGLB(url)) {
      return request<ArrayBuffer>(url, { type: "arraybuffer" })
        .then(GLTFUtil.parseGLB)
        .then(({ gltf, buffers }) => {
          glTFResource.gltf = gltf;
          glTFResource.buffers = buffers;
        });
    } else {
      return request(url, {
        type: "json"
      }).then((gltf: IGLTF) => {
        glTFResource.gltf = gltf;
        return Promise.all(
          gltf.buffers.map((buffer: IBuffer) => {
            return request<ArrayBuffer>(GLTFUtil.parseRelativeUrl(url, buffer.uri), { type: "arraybuffer" });
          })
        ).then((buffers: ArrayBuffer[]) => {
          glTFResource.buffers = buffers;
        });
      });
    }
  }

  private _isGLB(url: string): boolean {
    const index = url.lastIndexOf(".");
    return url.substring(index + 1, index + 4) === "glb";
  }
}
