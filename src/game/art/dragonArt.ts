/**
 * The dragons, drawn as data: vector shapes (SVG path strings) grouped into parts that animate on
 * their own (wings flap, tail sways, head bobs, jaw opens, eye blinks). DragonView turns the parts
 * into Pixi Graphics; `scripts/preview-dragons.ts` turns the same data into SVG to look at.
 *
 * Every part shares one 400×400 canvas with the dragon hovering and facing left, so parts line up
 * without offsets; each part turns around its own pivot. Shapes are flat colour in a cartoon style:
 * the shapes of a part marked `outlined` get one thick outline around their union, and shading,
 * highlights and lines sit on top without outlines.
 */

export const CANVAS = 400;
/** Width of the outline around each part, in canvas units. */
export const OUTLINE = 5;

export interface DragonPalette {
  body: number;
  /** Darker body tone: back, far wing bones, underside of the tail. */
  shade: number;
  /** Highlights on top of the head and back. */
  light: number;
  belly: number;
  bellyLine: number;
  membrane: number;
  membraneShade: number;
  horn: number;
  hornShade: number;
  outline: number;
  eyeWhite: number;
  iris: number;
  pupil: number;
  mouth: number;
}

export interface Shape {
  d: string;
  fill?: number;
  alpha?: number;
  /** A line instead of (or on top of) a fill. */
  stroke?: { color: number; width: number };
  /** Part of the silhouette: gets the part's outline. */
  outlined?: boolean;
}

export type PartName =
  | 'shadow'
  | 'wingBack'
  | 'tail'
  | 'wingFront'
  | 'body'
  | 'head'
  | 'mouth'
  | 'jaw'
  | 'skull'
  | 'eye'
  | 'brow';

export interface Part {
  name: PartName;
  /** Head pieces move with the head. */
  parent?: PartName;
  /** The point it turns and scales around, in canvas units. */
  pivot: [number, number];
  /** Size relative to the standard dragon (e.g. a young dragon's big head). */
  scale?: number;
  shapes: Shape[];
}

export type HornStyle = 'nubs' | 'curved' | 'crown';

export interface DragonDesign {
  palette: DragonPalette;
  horns: HornStyle;
  /** Spikes along the back and tail (otherwise soft bumps). */
  spikes: boolean;
  /** A frowning brow ridge over the eye. */
  brow: boolean;
  /** A beard of spikes under the jaw. */
  beard: boolean;
  /** Big round eyes (young) instead of slit pupils. */
  cute: boolean;
  headScale: number;
  wingScale: number;
  /** Size in its box: a young dragon is smaller than an ancient one. */
  size: number;
}

/** The part of the canvas the dragon uses, shadow included: what fills a DragonView's box. */
export const VIEW = { x: 14, y: 6, width: 394, height: 384 };

/** Where the parts turn. */
export const PIVOTS = {
  shoulderBack: [236, 180] as [number, number],
  shoulderFront: [216, 192] as [number, number],
  tailBase: [262, 262] as [number, number],
  neck: [140, 130] as [number, number],
  jawHinge: [138, 138] as [number, number],
  eye: [106, 100] as [number, number],
  /** Where fire leaves the mouth. */
  mouth: [52, 140] as [number, number],
  body: [216, 236] as [number, number],
  shadow: [216, 372] as [number, number],
};

/** An ellipse as four cubic curves (no arcs, so every renderer draws it the same). */
function ellipse(cx: number, cy: number, rx: number, ry: number): string {
  const k = 0.5523;
  const ox = rx * k;
  const oy = ry * k;
  return [
    `M ${cx - rx} ${cy}`,
    `C ${cx - rx} ${cy - oy} ${cx - ox} ${cy - ry} ${cx} ${cy - ry}`,
    `C ${cx + ox} ${cy - ry} ${cx + rx} ${cy - oy} ${cx + rx} ${cy}`,
    `C ${cx + rx} ${cy + oy} ${cx + ox} ${cy + ry} ${cx} ${cy + ry}`,
    `C ${cx - ox} ${cy + ry} ${cx - rx} ${cy + oy} ${cx - rx} ${cy} Z`,
  ].join(' ');
}

function horns(design: DragonDesign): Shape[] {
  const { horn, hornShade } = design.palette;
  switch (design.horns) {
    case 'nubs':
      return [
        { d: 'M 150 92 C 154 74 164 64 176 62 C 172 72 168 84 166 98 Z', fill: hornShade, outlined: true },
        { d: 'M 128 84 C 130 66 138 56 150 52 C 148 62 146 74 146 88 Z', fill: horn, outlined: true },
      ];
    case 'curved':
      return [
        { d: 'M 150 98 C 168 76 194 66 222 70 C 200 78 182 92 170 112 Z', fill: hornShade, outlined: true },
        { d: 'M 136 88 C 152 58 180 40 214 38 C 192 50 172 70 158 102 Z', fill: horn, outlined: true },
      ];
    case 'crown':
      return [
        { d: 'M 154 104 C 178 90 206 90 234 102 C 208 102 186 108 170 120 Z', fill: hornShade, outlined: true },
        { d: 'M 146 94 C 166 64 196 50 232 54 C 206 62 184 80 166 108 Z', fill: hornShade, outlined: true },
        { d: 'M 130 86 C 140 52 164 26 200 14 C 180 34 166 60 156 96 Z', fill: horn, outlined: true },
        // Rings on the big horn.
        { d: 'M 140 70 L 154 76', stroke: { color: hornShade, width: 3 } },
        { d: 'M 150 50 L 164 58', stroke: { color: hornShade, width: 3 } },
      ];
  }
}

/** Triangles along the back and tail, or round bumps for a young dragon. */
function backSpikes(design: DragonDesign): { neck: Shape[]; tail: Shape[] } {
  const color = design.palette.membrane;
  if (!design.spikes) {
    const bump = (x: number, y: number, r: number): Shape => ({ d: ellipse(x, y, r, r), fill: color, outlined: true });
    return {
      neck: [bump(172, 132, 9), bump(192, 158, 9), bump(226, 174, 10), bump(256, 186, 9)],
      tail: [bump(300, 254, 7), bump(326, 274, 6)],
    };
  }
  const spike = (d: string): Shape => ({ d, fill: color, outlined: true });
  return {
    neck: [
      spike('M 162 132 L 188 116 L 182 144 Z'),
      spike('M 180 156 L 210 144 L 200 170 Z'),
      spike('M 218 174 L 242 150 L 246 180 Z'),
      spike('M 250 184 L 280 170 L 274 200 Z'),
    ],
    tail: [spike('M 292 250 L 312 232 L 312 258 Z'), spike('M 318 268 L 342 256 L 336 282 Z')],
  };
}

export function dragonParts(design: DragonDesign): Part[] {
  const p = design.palette;
  const spikes = backSpikes(design);
  const eyeR = design.cute ? 17 : 13;

  const parts: Part[] = [
    {
      name: 'shadow',
      pivot: PIVOTS.shadow,
      shapes: [{ d: ellipse(216, 372, 92, 13), fill: 0x000000, alpha: 0.28 }],
    },
    {
      name: 'wingBack',
      pivot: PIVOTS.shoulderBack,
      scale: design.wingScale,
      shapes: [
        {
          d: 'M 236 180 L 214 106 L 238 52 L 300 36 Q 296 64 318 86 Q 300 104 312 130 Q 282 140 270 178 Z',
          fill: p.membraneShade,
          outlined: true,
        },
        { d: 'M 236 180 L 214 106 L 238 52', stroke: { color: p.shade, width: 10 } },
        { d: 'M 238 52 L 300 36 M 238 52 L 318 86 M 238 52 L 312 130', stroke: { color: p.shade, width: 5 } },
        { d: 'M 233 54 L 236 34 L 246 50 Z', fill: p.hornShade, outlined: true },
      ],
    },
    {
      name: 'tail',
      pivot: PIVOTS.tailBase,
      shapes: [
        ...spikes.tail,
        {
          d: 'M 255 238 C 298 244 330 268 342 302 C 349 322 360 332 372 326 C 368 344 344 352 326 336 C 314 318 296 300 260 292 Z',
          fill: p.body,
          outlined: true,
        },
        { d: 'M 362 332 C 372 316 384 304 394 298 C 394 316 388 336 380 350 C 372 346 366 340 362 332 Z', fill: p.membrane, outlined: true },
        {
          d: 'M 262 286 C 296 294 318 312 330 330 C 340 344 354 346 364 338 C 352 350 336 346 326 336 C 314 318 296 300 260 292 Z',
          fill: p.shade,
        },
      ],
    },
    {
      name: 'wingFront',
      pivot: PIVOTS.shoulderFront,
      scale: design.wingScale,
      shapes: [
        {
          d: 'M 216 192 L 250 120 L 292 64 L 374 72 Q 360 104 384 132 Q 356 148 358 184 Q 316 178 290 206 Q 262 196 240 212 Z',
          fill: p.membrane,
          outlined: true,
        },
        { d: 'M 292 64 L 358 184 Q 316 178 290 206 Q 262 196 240 212 L 250 120 Z', fill: p.membraneShade, alpha: 0.45 },
        { d: 'M 216 192 L 250 120 L 292 64', stroke: { color: p.body, width: 12 } },
        { d: 'M 292 64 L 374 72 M 292 64 L 384 132 M 292 64 L 358 184', stroke: { color: p.body, width: 6 } },
        { d: 'M 287 66 L 290 44 L 300 62 Z', fill: p.horn, outlined: true },
      ],
    },
    {
      name: 'body',
      pivot: PIVOTS.body,
      shapes: [
        ...spikes.neck,
        // Hind leg and foot, front arm and hand: behind the torso, which covers where they join.
        { d: 'M 240 280 C 236 300 232 312 226 322 L 270 324 C 266 310 270 296 278 280 Z', fill: p.body, outlined: true },
        { d: 'M 226 320 L 214 332 L 234 330 Z M 246 322 L 240 336 L 256 332 Z M 264 322 L 264 336 L 276 328 Z', fill: p.horn, outlined: true },
        { d: 'M 172 256 C 162 270 156 282 150 296 L 176 298 C 180 286 188 274 196 262 Z', fill: p.body, outlined: true },
        { d: 'M 150 294 L 140 304 L 158 304 Z M 164 297 L 160 309 L 174 305 Z', fill: p.horn, outlined: true },
        // Neck and torso.
        {
          d: 'M 150 236 C 128 214 112 188 106 160 C 118 134 142 120 166 120 C 170 146 188 166 214 178 C 190 196 168 214 150 236 Z',
          fill: p.body,
          outlined: true,
        },
        {
          d: 'M 148 218 C 146 178 196 160 240 176 C 282 192 302 236 288 270 C 274 302 220 308 186 290 C 160 276 150 250 148 218 Z',
          fill: p.body,
          outlined: true,
        },
        { d: ellipse(258, 262, 34, 30), fill: p.body, outlined: true },
        // Shading on the back and the thigh, a highlight on top.
        { d: 'M 196 168 C 236 166 284 196 292 244 C 296 262 290 276 280 286 C 286 250 262 210 214 186 Z', fill: p.shade },
        { d: 'M 230 278 C 242 292 266 294 284 280 C 280 290 266 296 252 294 C 242 292 234 286 230 278 Z', fill: p.shade },
        { d: 'M 202 178 C 222 172 246 180 262 194 C 242 188 222 186 206 188 Z', fill: p.light, alpha: 0.7 },
        // Belly plates from the throat down.
        {
          d: 'M 112 165 C 120 196 134 220 152 240 C 166 262 180 282 200 294 C 214 300 228 302 240 300 C 226 290 210 282 196 270 C 180 254 168 236 158 214 C 148 196 140 180 134 162 Z',
          fill: p.belly,
        },
        {
          d: 'M 116 182 L 139 176 M 124 204 L 148 196 M 136 226 L 161 216 M 152 248 L 176 236 M 170 268 L 193 255 M 192 286 L 211 272',
          stroke: { color: p.bellyLine, width: 3 },
        },
      ],
    },
    { name: 'head', pivot: PIVOTS.neck, scale: design.headScale, shapes: [] },
    {
      name: 'mouth',
      parent: 'head',
      pivot: PIVOTS.neck,
      shapes: [{ d: 'M 136 126 L 52 124 L 56 148 L 138 148 Z', fill: p.mouth }],
    },
    {
      name: 'jaw',
      parent: 'head',
      pivot: PIVOTS.jawHinge,
      shapes: [
        ...(design.beard
          ? [
              { d: 'M 72 152 L 64 176 L 86 156 Z', fill: p.membrane, outlined: true },
              { d: 'M 96 156 L 94 182 L 112 156 Z', fill: p.membrane, outlined: true },
            ]
          : []),
        {
          d: 'M 144 132 C 122 140 88 142 58 138 C 50 142 52 152 62 155 C 92 160 124 156 146 146 Z',
          fill: p.body,
          outlined: true,
        },
        { d: 'M 64 142 C 90 147 120 146 140 140 C 122 150 92 153 66 150 Z', fill: p.belly },
        { d: 'M 70 140 L 74 130 L 79 141 Z M 96 141 L 100 131 L 104 142 Z', fill: p.eyeWhite },
      ],
    },
    {
      name: 'skull',
      parent: 'head',
      pivot: PIVOTS.neck,
      shapes: [
        ...horns(design),
        // Frill behind the cheek.
        { d: 'M 148 106 L 188 98 L 166 116 L 194 124 L 158 132 Z', fill: p.membrane, outlined: true },
        {
          d: 'M 160 110 C 160 78 128 66 100 72 C 80 76 66 88 54 98 C 42 106 38 122 48 130 C 74 132 110 134 140 138 C 156 134 162 124 160 110 Z',
          fill: p.body,
          outlined: true,
        },
        { d: 'M 66 92 C 84 80 110 74 130 78 C 110 82 90 90 74 100 Z', fill: p.light, alpha: 0.7 },
        { d: 'M 48 128 C 80 130 112 133 140 137 C 120 140 80 138 50 134 Z', fill: p.shade },
        { d: ellipse(58, 104, 5, 3), fill: p.outline },
        // Fangs over the lower jaw.
        { d: 'M 60 128 L 65 142 L 71 129 Z M 84 130 L 89 142 L 94 131 Z', fill: p.eyeWhite, outlined: true },
      ],
    },
    {
      name: 'eye',
      parent: 'head',
      pivot: PIVOTS.eye,
      shapes: design.cute
        ? [
            { d: ellipse(106, 100, eyeR, eyeR + 2), fill: p.eyeWhite, outlined: true },
            { d: ellipse(100, 102, 10, 12), fill: p.iris },
            { d: ellipse(99, 103, 6, 8), fill: p.pupil },
            { d: ellipse(95, 97, 4, 4), fill: 0xffffff },
            { d: ellipse(104, 108, 2, 2), fill: 0xffffff },
          ]
        : [
            { d: ellipse(106, 100, eyeR, eyeR), fill: p.eyeWhite, outlined: true },
            { d: ellipse(101, 101, 9, 11), fill: p.iris },
            { d: ellipse(100, 101, 3, 9), fill: p.pupil },
            { d: ellipse(97, 95, 3, 3), fill: 0xffffff },
          ],
    },
    {
      name: 'brow',
      parent: 'head',
      pivot: PIVOTS.eye,
      shapes: design.brow
        ? [{ d: 'M 84 86 C 100 78 120 78 134 84 L 128 96 C 114 90 100 92 88 98 Z', fill: p.shade, outlined: true }]
        : [],
    },
  ];
  return parts;
}

const OUTLINE_YOUNG = 0x173a2a;

/** Each dragon of the game, by id: the three enemies and the two duel colours. */
export const DESIGNS: Record<string, DragonDesign> = {
  'young-dragon': {
    palette: {
      body: 0x5cc97f,
      shade: 0x379a5c,
      light: 0xa6f0b9,
      belly: 0xf6e7a8,
      bellyLine: 0xd8c27a,
      membrane: 0x9be3b0,
      membraneShade: 0x4fae74,
      horn: 0xf6ecd0,
      hornShade: 0xd8ccaa,
      outline: OUTLINE_YOUNG,
      eyeWhite: 0xffffff,
      iris: 0x3a8de0,
      pupil: 0x10213a,
      mouth: 0x6e2030,
    },
    horns: 'nubs',
    spikes: false,
    brow: false,
    beard: false,
    cute: true,
    headScale: 1.18,
    wingScale: 0.8,
    size: 0.8,
  },
  dragon: {
    palette: {
      body: 0xe0503c,
      shade: 0xa8302a,
      light: 0xff9a7a,
      belly: 0xffd27a,
      bellyLine: 0xe0a64a,
      membrane: 0xf58a4a,
      membraneShade: 0xb84a30,
      horn: 0xf6ecd0,
      hornShade: 0xcfc0a0,
      outline: 0x2e0f14,
      eyeWhite: 0xfff3d6,
      iris: 0xffb030,
      pupil: 0x1a0a0a,
      mouth: 0x5a1020,
    },
    horns: 'curved',
    spikes: true,
    brow: true,
    beard: false,
    cute: false,
    headScale: 1,
    wingScale: 1,
    size: 0.92,
  },
  'ancient-dragon': {
    palette: {
      body: 0x5a4a8e,
      shade: 0x3a2d66,
      light: 0x8f7ccc,
      belly: 0xd9b24a,
      bellyLine: 0xa07f24,
      membrane: 0x8a5cc8,
      membraneShade: 0x4e3388,
      horn: 0xffd56b,
      hornShade: 0xc9a227,
      outline: 0x0f0a1a,
      eyeWhite: 0xffd36b,
      iris: 0xff7a1a,
      pupil: 0x1a0606,
      mouth: 0x3a0a14,
    },
    horns: 'crown',
    spikes: true,
    brow: true,
    beard: true,
    cute: false,
    headScale: 1,
    wingScale: 1.1,
    size: 1,
  },
  /** Yours in a duel: blue like your digits. */
  'duel-mine': {
    palette: {
      body: 0x4a9fe0,
      shade: 0x2f6fb0,
      light: 0x9fd4ff,
      belly: 0xd8f0ff,
      bellyLine: 0x9ccbe8,
      membrane: 0x7cc4f5,
      membraneShade: 0x3a7cc0,
      horn: 0xf6ecd0,
      hornShade: 0xcfc0a0,
      outline: 0x0e1d33,
      eyeWhite: 0xffffff,
      iris: 0xffd56b,
      pupil: 0x10213a,
      mouth: 0x4a1424,
    },
    horns: 'curved',
    spikes: true,
    brow: true,
    beard: false,
    cute: false,
    headScale: 1,
    wingScale: 1,
    size: 1,
  },
  /** The rival's: orange like their digits. */
  'duel-rival': {
    palette: {
      body: 0xf08a3c,
      shade: 0xb85a24,
      light: 0xffc08a,
      belly: 0xffe3a3,
      bellyLine: 0xe0b060,
      membrane: 0xffb35a,
      membraneShade: 0xc0642a,
      horn: 0xf6ecd0,
      hornShade: 0xcfc0a0,
      outline: 0x2e140a,
      eyeWhite: 0xfff3d6,
      iris: 0x7a2fd0,
      pupil: 0x1a0a0a,
      mouth: 0x5a1020,
    },
    horns: 'curved',
    spikes: true,
    brow: true,
    beard: false,
    cute: false,
    headScale: 1,
    wingScale: 1,
    size: 1,
  },
};

/** Turns of the moving parts, in radians, for previews and fixed poses. */
export type Pose = Partial<Record<PartName, number>>;

/** The dragon as one SVG document, framed like a DragonView (for previews). `size` is its width in px. */
export function dragonSvg(design: DragonDesign, pose: Pose = {}, size = VIEW.width): string {
  const parts = dragonParts(design);
  const outline = design.palette.outline;
  const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;
  const transform = (part: Part) => {
    const [x, y] = part.pivot;
    const deg = ((pose[part.name] ?? 0) * 180) / Math.PI;
    const s = part.scale ?? 1;
    return `translate(${x} ${y}) rotate(${deg}) scale(${s}) translate(${-x} ${-y})`;
  };
  const drawShapes = (part: Part) => {
    const out: string[] = [];
    for (const shape of part.shapes) {
      if (shape.outlined) {
        out.push(
          `<path d="${shape.d}" fill="${hex(outline)}" stroke="${hex(outline)}" stroke-width="${OUTLINE * 2}" stroke-linejoin="round"/>`,
        );
      }
    }
    for (const shape of part.shapes) {
      const alpha = shape.alpha ?? 1;
      if (shape.fill !== undefined) out.push(`<path d="${shape.d}" fill="${hex(shape.fill)}" fill-opacity="${alpha}"/>`);
      if (shape.stroke) {
        out.push(
          `<path d="${shape.d}" fill="none" stroke="${hex(shape.stroke.color)}" stroke-width="${shape.stroke.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      }
    }
    return out.join('');
  };
  const render = (part: Part): string => {
    const children = parts.filter((child) => child.parent === part.name).map(render).join('');
    return `<g transform="${transform(part)}">${drawShapes(part)}${children}</g>`;
  };
  const body = parts.filter((part) => !part.parent).map(render).join('');
  const height = Math.round((size * VIEW.height) / VIEW.width);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${height}" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.width} ${VIEW.height}">${body}</svg>`;
}
