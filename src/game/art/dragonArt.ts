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
  | 'armBack'
  | 'body'
  | 'armFront'
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
  /** The near arm's shoulder (the far arm's is a little up and ahead, see FAR_ARM). */
  shoulder: [180, 218] as [number, number],
  neck: [140, 130] as [number, number],
  jawHinge: [138, 138] as [number, number],
  eye: [106, 98] as [number, number],
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

/** Moves every point of a path (all paths here use absolute commands, so every number is an x or a y). */
function shift(d: string, dx: number, dy: number): string {
  let i = 0;
  return d.replace(/-?\d+(\.\d+)?/g, (n) => String(Number(n) + (i++ % 2 === 0 ? dx : dy)));
}

/** The far arm sits a little up and ahead of the near one, mostly behind the chest. */
const FAR_ARM: [number, number] = [-22, -6];

/**
 * A front leg held up like an arm, as a flying dragon does: the upper arm hangs from the shoulder,
 * the forearm reaches forward, and three fingers end in claws. The far one is a darker copy.
 */
function armShapes(p: DragonPalette, far: boolean): Shape[] {
  const [dx, dy] = far ? FAR_ARM : [0, 0];
  const skin = far ? p.shade : p.body;
  const at = (d: string) => shift(d, dx, dy);
  return [
    // Fingers first, curled down and a little forward; the forearm covers where they join.
    { d: at('M 152 268 C 143 266 135 270 133 279 C 138 283 146 281 152 277 Z'), fill: skin, outlined: true },
    { d: at('M 153 276 C 147 281 143 289 145 296 C 151 296 155 290 159 282 Z'), fill: skin, outlined: true },
    { d: at('M 161 279 C 160 287 161 293 165 297 C 169 293 170 286 169 279 Z'), fill: skin, outlined: true },
    { d: at('M 135 275 L 125 283 L 136 283 Z M 142 293 L 143 304 L 149 296 Z M 162 295 L 166 305 L 168 295 Z'), fill: p.horn, outlined: true },
    // Upper arm hanging from the shoulder, forearm reaching forward and down.
    {
      d: at('M 198 212 C 203 230 199 248 193 258 C 189 266 183 272 175 276 C 167 280 159 283 151 284 C 142 284 139 273 146 269 C 154 265 162 261 166 255 C 164 243 160 231 164 220 C 170 205 189 203 198 212 Z'),
      fill: skin,
      outlined: true,
    },
    // Shade along the back of the arm; a highlight on the near shoulder.
    { d: at('M 197 222 C 199 238 196 252 190 262 C 184 271 172 279 156 283 C 170 274 182 264 188 250 C 192 240 194 230 197 222 Z'), fill: far ? p.outline : p.shade, alpha: far ? 0.3 : 1 },
    ...(far ? [] : [{ d: 'M 170 214 C 177 207 189 206 194 213 C 186 211 179 214 173 220 Z', fill: p.light, alpha: 0.7 }]),
  ];
}

/** The eye inside the head: big and round for a young (cute) dragon, an almond with a slit pupil otherwise. */
function eyeShapes(design: DragonDesign): Shape[] {
  const p = design.palette;
  return design.cute
    ? [
        { d: ellipse(106, 97, 14, 15), fill: p.eyeWhite, outlined: true },
        { d: ellipse(101, 99, 10, 12), fill: p.iris },
        { d: ellipse(100, 100, 6.5, 8), fill: p.pupil },
        { d: ellipse(96, 94, 4, 4), fill: 0xffffff },
        { d: ellipse(104, 105, 2, 2), fill: 0xffffff },
      ]
    : [
        { d: ellipse(106, 98, 11, 10.5), fill: p.eyeWhite, outlined: true },
        { d: ellipse(102, 99, 7.5, 9), fill: p.iris },
        { d: ellipse(101, 99, 2.6, 7.5), fill: p.pupil },
        { d: ellipse(99, 94.5, 2.6, 2.6), fill: 0xffffff },
      ];
}

/**
 * The upper eyelid, in the skin's colour over the top of the eye (it does not close in a blink, the
 * eye squints under it): drawn down at the front for a frowning dragon, a light lid otherwise, just
 * a sliver over big young eyes.
 */
function lidShapes(design: DragonDesign): Shape[] {
  const p = design.palette;
  if (design.cute) {
    const edge = 'M 122 87 C 113 81 100 82 91 90';
    return [
      { d: `M 88 96 C 85 80 100 72 114 73 C 126 74 132 82 122 87 C 113 81 100 82 91 90 Z`, fill: p.body },
      { d: edge, stroke: { color: p.outline, width: 3.5 } },
    ];
  }
  const edge = design.brow ? 'C 112 89 101 91 92 99' : 'C 112 86 100 87 93 92';
  const start = design.brow ? 'M 120 92' : 'M 120 89';
  return [
    { d: `M 90 100 C 88 86 102 80 114 81 C 124 82 129 88 120 ${design.brow ? 92 : 89} ${edge} Z`, fill: p.body },
    { d: `${start} ${edge}`, stroke: { color: p.outline, width: 3.5 } },
  ];
}

export function dragonParts(design: DragonDesign): Part[] {
  const p = design.palette;
  const spikes = backSpikes(design);

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
    { name: 'armBack', pivot: [PIVOTS.shoulder[0] + FAR_ARM[0], PIVOTS.shoulder[1] + FAR_ARM[1]], shapes: armShapes(p, true) },
    {
      name: 'body',
      pivot: PIVOTS.body,
      shapes: [
        ...spikes.neck,
        // Hind leg and foot: behind the torso, which covers where they join.
        { d: 'M 240 280 C 236 300 232 312 226 322 L 270 324 C 266 310 270 296 278 280 Z', fill: p.body, outlined: true },
        { d: 'M 226 320 L 214 332 L 234 330 Z M 246 322 L 240 336 L 256 332 Z M 264 322 L 264 336 L 276 328 Z', fill: p.horn, outlined: true },
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
    { name: 'armFront', pivot: PIVOTS.shoulder, shapes: armShapes(p, false) },
    { name: 'head', pivot: PIVOTS.neck, scale: design.headScale, shapes: [] },
    {
      name: 'mouth',
      parent: 'head',
      pivot: PIVOTS.neck,
      // Inside of the mouth and the tongue: seen only when the jaw drops.
      shapes: [
        { d: 'M 148 126 L 50 122 C 44 132 48 144 60 146 L 148 148 Z', fill: p.mouth },
        { d: 'M 134 141 C 112 136 86 136 64 141 C 86 146 114 148 134 145 Z', fill: 0xd9506a, alpha: 0.9 },
      ],
    },
    {
      name: 'jaw',
      parent: 'head',
      pivot: PIVOTS.jawHinge,
      shapes: [
        ...(design.beard
          ? [
              { d: 'M 66 148 L 58 172 L 82 152 Z', fill: p.membrane, outlined: true },
              { d: 'M 92 152 L 88 178 L 108 152 Z', fill: p.membrane, outlined: true },
              { d: 'M 118 150 L 120 170 L 132 148 Z', fill: p.membrane, outlined: true },
            ]
          : []),
        // The lower jaw: a solid chin, not a stick, so it still looks like a jaw when it drops.
        {
          d: 'M 150 129 C 124 132 92 130 62 129 C 49 129 43 138 49 146 C 58 156 84 158 108 156 C 128 155 142 150 152 142 Z',
          fill: p.body,
          outlined: true,
        },
        { d: 'M 52 148 C 64 154 92 156 114 154 C 130 152 142 148 151 143 C 140 154 116 160 92 160 C 72 160 58 155 52 148 Z', fill: p.belly },
        // Lower teeth: hidden under the upper lip until the mouth opens.
        { d: 'M 72 130 L 76 120 L 81 130 Z M 98 131 L 102 121 L 107 131 Z', fill: p.eyeWhite },
      ],
    },
    {
      name: 'skull',
      parent: 'head',
      pivot: PIVOTS.neck,
      shapes: [
        ...horns(design),
        // Frill behind the cheek.
        { d: 'M 150 104 L 190 96 L 168 114 L 196 122 L 160 132 Z', fill: p.membrane, outlined: true },
        // A rounded skull over a snout that tapers to a blunt nose, with a cheek at the back.
        {
          d: 'M 44 108 C 44 96 52 88 64 86 C 76 84 86 80 94 74 C 108 62 132 58 150 66 C 166 74 172 92 168 108 C 166 122 158 132 146 138 C 132 140 120 135 110 132 C 92 130 66 128 50 126 C 44 124 42 116 44 108 Z',
          fill: p.body,
          outlined: true,
        },
        // A frowning dragon has a heavy brow ridge, part of its outline.
        ...(design.brow ? [{ d: 'M 86 88 C 94 76 118 70 136 76 C 132 84 120 88 106 90 C 96 92 90 92 86 88 Z', fill: p.body, outlined: true }] : []),
        // Light along the top of the snout and skull, shade along the upper lip and down the cheek.
        { d: 'M 58 92 C 70 87 84 83 94 76 C 106 67 122 63 138 64 C 120 68 106 76 97 84 C 85 92 70 95 58 96 Z', fill: p.light, alpha: 0.6 },
        { d: 'M 46 119 C 70 123 96 127 112 130 L 110 132 C 92 130 66 128 50 126 Z', fill: p.shade },
        { d: 'M 126 112 C 136 118 143 125 148 133', stroke: { color: p.shade, width: 4 } },
        // Nostril and the corner of the mouth.
        { d: 'M 53 97 C 56 92 62 91 66 94', stroke: { color: p.outline, width: 3.5 } },
        { d: 'M 106 131 C 112 130 116 127 118 122', stroke: { color: p.outline, width: 3.5 } },
        // Two fangs over the lower lip.
        { d: 'M 62 126 L 66 138 L 71 127 Z M 86 128 L 90 139 L 95 129 Z', fill: p.eyeWhite, outlined: true },
      ],
    },
    { name: 'eye', parent: 'head', pivot: PIVOTS.eye, shapes: eyeShapes(design) },
    { name: 'brow', parent: 'head', pivot: PIVOTS.eye, shapes: lidShapes(design) },
  ];
  return parts;
}

const OUTLINE_YOUNG = 0x173a2a;

/** The shape of a duel dragon: a grown fighter, all of them the same size so neither side looks weaker. */
const FIGHTER = {
  horns: 'curved',
  spikes: true,
  brow: true,
  beard: false,
  cute: false,
  headScale: 1,
  wingScale: 1,
  size: 1,
} as const satisfies Omit<DragonDesign, 'palette'>;

/** Each dragon of the game, by id: the three enemies, the two duel colours and the skins sold in the shop. */
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
    ...FIGHTER,
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
    ...FIGHTER,
  },
  // Skins (src/game/dragonSkins.ts): each must stand out against the duel's twilight.
  /** Green with golden wings and spikes. */
  'skin-emerald': {
    palette: {
      body: 0x22b07d,
      shade: 0x137a56,
      light: 0x7ef0c0,
      belly: 0xf3e6b0,
      bellyLine: 0xcdb878,
      membrane: 0xffd25e,
      membraneShade: 0xd69a2a,
      horn: 0xfff0c0,
      hornShade: 0xd9bf78,
      outline: 0x0b2a1f,
      eyeWhite: 0xfffbe6,
      iris: 0xe0402a,
      pupil: 0x150808,
      mouth: 0x5a1020,
    },
    ...FIGHTER,
  },
  /** A pink marshmallow with lilac wings and big round eyes. */
  'skin-candy': {
    palette: {
      body: 0xff9ccf,
      shade: 0xe06aa8,
      light: 0xffd4ea,
      belly: 0xfff3c4,
      bellyLine: 0xf2cf8a,
      membrane: 0xb9a2ff,
      membraneShade: 0x8a6ee6,
      horn: 0xfff6e0,
      hornShade: 0xe9d6b0,
      outline: 0x4a1238,
      eyeWhite: 0xffffff,
      iris: 0x7a3fe0,
      pupil: 0x20103a,
      mouth: 0x7a2040,
    },
    ...FIGHTER,
    horns: 'nubs',
    spikes: false,
    brow: false,
    cute: true,
    headScale: 1.12,
    wingScale: 0.92,
  },
  /** Pale ice with sky-blue wings. */
  'skin-frost': {
    palette: {
      body: 0xcdeeff,
      shade: 0x8cc6ea,
      light: 0xffffff,
      belly: 0xffffff,
      bellyLine: 0xb8dcf2,
      membrane: 0x6fd0ff,
      membraneShade: 0x3f98d8,
      horn: 0xeafcff,
      hornShade: 0x9fdcf5,
      outline: 0x123050,
      eyeWhite: 0xffffff,
      iris: 0x2f8fe0,
      pupil: 0x0a1a33,
      mouth: 0x2a3a6a,
    },
    ...FIGHTER,
  },
  /** Smoke grey with violet wings and glowing green eyes. */
  'skin-shadow': {
    palette: {
      body: 0x4a4566,
      shade: 0x2e2a45,
      light: 0x7c74a8,
      belly: 0x9b8fd0,
      bellyLine: 0x6f63a8,
      membrane: 0x9a5cff,
      membraneShade: 0x5a2fb8,
      horn: 0xd6ccff,
      hornShade: 0x9a8fd8,
      outline: 0x0c0a16,
      eyeWhite: 0xd6ff6a,
      iris: 0x3ccf6a,
      pupil: 0x0c1a08,
      mouth: 0x2a0a3a,
    },
    ...FIGHTER,
    beard: true,
  },
  /** Dark rock glowing orange through the belly, wings and horns. */
  'skin-magma': {
    palette: {
      body: 0x553030,
      shade: 0x351c1c,
      light: 0x8a5446,
      belly: 0xff9a3a,
      bellyLine: 0xe0602a,
      membrane: 0xff6a2a,
      membraneShade: 0xc23a1a,
      horn: 0xffd05a,
      hornShade: 0xe08a2a,
      outline: 0x140808,
      eyeWhite: 0xffe36a,
      iris: 0xff5a1a,
      pupil: 0x1a0505,
      mouth: 0x5a1010,
    },
    ...FIGHTER,
  },
  /** Gold with crimson wings, a crown of ivory horns and a beard. */
  'skin-king': {
    palette: {
      body: 0xf2c240,
      shade: 0xc78f1f,
      light: 0xffe89a,
      belly: 0xfff4d0,
      bellyLine: 0xe2c27a,
      membrane: 0xd8343f,
      membraneShade: 0x9a1c2c,
      horn: 0xfffbea,
      hornShade: 0xe0d4b0,
      outline: 0x3a2205,
      eyeWhite: 0xffffff,
      iris: 0x2a8ad8,
      pupil: 0x0a1020,
      mouth: 0x5a1020,
    },
    ...FIGHTER,
    horns: 'crown',
    beard: true,
    wingScale: 1.08,
  },
  // Campaign dragons (core/battle/campaign.ts) that are not skins: two bosses, a bit bigger and crowned,
  // and two dragons of the moonlit ruins.
  /** Strażnik Doliny: deep forest green with leafy wings, a gold crown of horns and a beard. */
  'boss-valley': {
    palette: {
      body: 0x3f9a4a,
      shade: 0x2a6e33,
      light: 0x8fd88f,
      belly: 0xf3e2a0,
      bellyLine: 0xc9b26a,
      membrane: 0x8fd16a,
      membraneShade: 0x4a8f3a,
      horn: 0xffd56b,
      hornShade: 0xc9a227,
      outline: 0x10261a,
      eyeWhite: 0xfff6d0,
      iris: 0xe07a1a,
      pupil: 0x1a0a05,
      mouth: 0x5a1020,
    },
    ...FIGHTER,
    horns: 'crown',
    beard: true,
    wingScale: 1.1,
    size: 1.06,
  },
  /** Władca Wulkanu: black obsidian glowing with lava, crimson wings, a crown of fiery horns. */
  'boss-volcano': {
    palette: {
      body: 0x2e2434,
      shade: 0x1a1320,
      light: 0x5e4c6a,
      belly: 0xff6a2a,
      bellyLine: 0xd8401a,
      membrane: 0xd8343f,
      membraneShade: 0x8a1a24,
      horn: 0xffb030,
      hornShade: 0xd07a1a,
      outline: 0x0a0608,
      eyeWhite: 0xffe36a,
      iris: 0xff3a1a,
      pupil: 0x1a0505,
      mouth: 0x5a0a10,
    },
    ...FIGHTER,
    horns: 'crown',
    beard: true,
    wingScale: 1.12,
    size: 1.08,
  },
  /** Burzowy smok: storm teal with slate wings and lightning-yellow eyes. */
  'enemy-storm': {
    palette: {
      body: 0x2f9fae,
      shade: 0x1d6a78,
      light: 0x9fe8f0,
      belly: 0xdcf6fa,
      bellyLine: 0x9ed4dc,
      membrane: 0xa7bcd0,
      membraneShade: 0x60778c,
      horn: 0xeef6ff,
      hornShade: 0xaac4d8,
      outline: 0x0a1e26,
      eyeWhite: 0xfff7a0,
      iris: 0xffc21a,
      pupil: 0x0a1a20,
      mouth: 0x1e2a4a,
    },
    ...FIGHTER,
  },
  /** Kościany smok: pale bone with dark violet wings and eerie green eyes. */
  'enemy-bone': {
    palette: {
      body: 0xe8dfc8,
      shade: 0xb8ab8a,
      light: 0xfffaf0,
      belly: 0xcfc3a3,
      bellyLine: 0xa89a76,
      membrane: 0x5e3d80,
      membraneShade: 0x372251,
      horn: 0x6a5a48,
      hornShade: 0x4a3d30,
      outline: 0x1a1424,
      eyeWhite: 0xb6ff7a,
      iris: 0x3ad06a,
      pupil: 0x0a1a08,
      mouth: 0x2a0a2a,
    },
    ...FIGHTER,
    beard: true,
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
