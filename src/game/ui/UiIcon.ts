import { Rectangle, Sprite, Texture } from 'pixi.js';
import atlasUrl from '../../../assets/ui/kenney-icons.png?url';
import { iconFiles, ICON_CELL, ICON_COLUMNS, type UiIconName } from './iconCatalog.ts';

const textures = new Map<UiIconName, Texture>();
let loading: Promise<void> | undefined;

/** Decode once before the first screen. Retry after a failed load through the normal boot retry. */
export function loadUiIcons(): Promise<void> {
  return loading ??= (async () => {
    const image = new Image(); image.src = atlasUrl;
    await image.decode();
    const atlas = Texture.from(image);
    (Object.keys(iconFiles) as UiIconName[]).forEach((name, i) => {
      textures.set(name, new Texture({ source: atlas.source,
        frame: new Rectangle(i % ICON_COLUMNS * ICON_CELL, Math.floor(i / ICON_COLUMNS) * ICON_CELL, ICON_CELL, ICON_CELL) }));
    });
  })().catch((error) => { loading = undefined; throw error; });
}

/** Shared atlas textures outlive individual screens. The visible glyph occupies 75% of its tile. */
export class UiIcon extends Sprite {
  constructor(name: UiIconName) {
    super(textures.get(name) ?? Texture.EMPTY);
    this.anchor.set(0.5); this.eventMode = 'none';
  }
  setKind(name: UiIconName): void { this.texture = textures.get(name) ?? Texture.EMPTY; }
  fit(size: number): void { this.width = size / .75; this.height = size / .75; }
}
