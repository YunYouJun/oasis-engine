import { Engine } from "../../Engine";
import { Texture2D } from "../../texture";
import { FontAtlas } from "../atlas/FontAtlas";
import { CharInfo } from "./CharInfo";

/**
 * @internal
 */
export class SubFont {
  private _engine: Engine;
  private _fontAtlases: FontAtlas[] = [];
  private _lastIndex: number = -1;

  constructor(engine: Engine) {
    this._engine = engine;
  }

  destroy(): void {
    const fontAtlases = this._fontAtlases;
    for (let i = 0, n = fontAtlases.length; i < n; ++i) {
      fontAtlases[i].destroy(true);
    }
    fontAtlases.length = 0;
  }

  /**
   * @internal
   */
  _uploadCharTexture(charInfo: CharInfo): void {
    const fontAtlases = this._fontAtlases;
    let lastIndex = this._lastIndex;
    if (lastIndex === -1) {
      this._createFontAtlas();
      lastIndex++;
    }
    let fontAtlas = fontAtlases[lastIndex];
    if (!fontAtlas.uploadCharTexture(charInfo)) {
      fontAtlas = this._createFontAtlas();
      fontAtlas.uploadCharTexture(charInfo);
      lastIndex++;
    }
    this._lastIndex = lastIndex;
    charInfo.data = null;
  }

  /**
   * @internal
   */
  _addCharInfo(char: string, charInfo: CharInfo): void {
    const lastIndex = this._lastIndex;
    charInfo.index = lastIndex;
    this._fontAtlases[lastIndex].addCharInfo(char, charInfo);
  }

  /**
   * @internal
   */
  _getCharInfo(char: string): CharInfo {
    const fontAtlases = this._fontAtlases;
    for (let i = 0, n = fontAtlases.length; i < n; ++i) {
      const fontAtlas = fontAtlases[i];
      const charInfo = fontAtlas.getCharInfo(char);
      if (charInfo) {
        return charInfo;
      }
    }
    return null;
  }

  /**
   * @internal
   */
  _getTextureByIndex(index: number): Texture2D {
    const fontAtlas = this._fontAtlases[index];
    if (fontAtlas) {
      return fontAtlas.texture;
    }
    return null;
  }

  /**
   * @internal
   */
  _getLastIndex(): number {
    return this._lastIndex;
  }

  private _createFontAtlas(): FontAtlas {
    const { _engine: engine } = this;
    const fontAtlas = new FontAtlas(engine);
    const texture = new Texture2D(engine, 256, 256);
    fontAtlas.texture = texture;
    this._fontAtlases.push(fontAtlas);
    return fontAtlas;
  }
}
