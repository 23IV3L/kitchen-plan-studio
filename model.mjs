export const TYPES = {
  fridge: { label: 'Refrigerator housing', short: 'FR', kind: 'tall', front: 'single' },
  oven: { label: 'Oven + microwave tower', short: 'OV', kind: 'tall', front: 'appliance' },
  base: { label: 'Base cabinet', short: 'B', kind: 'base', front: 'double' },
  drawers: { label: 'Drawer cabinet', short: 'DR', kind: 'base', front: 'drawers' },
  hob: { label: 'Cooking top / hob cabinet', short: 'HB', kind: 'base', front: 'drawers' },
  sink: { label: 'Sink cabinet', short: 'SK', kind: 'base', front: 'double' },
  dishwasher: { label: 'Dishwasher housing', short: 'DW', kind: 'base', front: 'single' },
  upper: { label: 'Upper cabinet', short: 'UP', kind: 'upper', front: 'double' },

  upperBlindCorner: {
    label: 'Upper blind-corner cabinet',
    short: 'UBC',
    kind: 'upper',
    front: 'single'
  },

  corner: { label: 'Corner base cabinet', short: 'CR', kind: 'base', front: 'single' },

  cornerUpper: {
    label: 'Upper corner cabinet',
    short: 'CU',
    kind: 'upper',
    front: 'single'
  },

  filler: { label: 'Filler / end panel', short: 'F', kind: 'base', front: 'single' }
};

export const INITIAL_ROOM = {
  length: 3000,
  width: 1830,
  height: 2500,
  worktop: 900,
  topThickness: 40,
  plinth: 100,
  corner: 600,
  upperBottom: 1500,
  depth: 600,
  upperDepth: 350,
  floorColour: '#c5ae8e',
  wallColour: '#e9e6df',
  topColour: '#ba9065'
};

export function newProject() {
  const project = {
    version: 1,
    title: 'My L-shaped kitchen',
    room: { ...INITIAL_ROOM },
    cabinets: [],
    reference: 'assets/floor-plan.jpg',
    referenceName: 'Test_FloorPlan.jpg'
  };

  draft(project);
  return project;
}

export function uid() {
  return 'c' +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7);
}

export function bounds(c, r) {
  return c.wall === 'main'
    ? {
        x: 0,
        z: c.position,
        w: c.depth,
        d: c.width,
        y: c.bottom,
        h: c.height
      }
    : {
        x: c.position,
        z: r.length - c.depth,
        w: c.width,
        d: c.depth,
        y: c.bottom,
        h: c.height
      };
}

export function intersect(a, b) {
  return (
    a.x < b.x + b.w - 0.1 &&
    a.x + a.w > b.x + 0.1 &&
    a.z < b.z + b.d - 0.1 &&
    a.z + a.d > b.z + 0.1 &&
    a.y < b.y + b.h - 0.1 &&
    a.y + a.h > b.y + 0.1
  );
}

function isCornerType(type) {
  return type === 'corner' || type === 'cornerUpper';
}

function isBlindUpper(type) {
  return type === 'upperBlindCorner';
}

export function defaultCabinet(type, wall, r) {
  const t = TYPES[type];

  const upper = t.kind === 'upper';
  const tall = t.kind === 'tall';
  const corner = isCornerType(type);
  const blindUpper = isBlindUpper(type);

  if (corner || blindUpper) {
    wall = 'main';
  }

  let position = wall === 'main'
    ? 0
    : r.corner;

  let width = type === 'filler'
    ? 30
    : 600;

  let depth = upper
    ? r.upperDepth
    : r.depth;

  if (corner) {
    position = r.length - r.corner;
    width = r.corner;
    depth = r.corner;
  }

  if (blindUpper) {
    position = r.length - r.corner - 600;
    width = 600 + r.corner;
    depth = r.upperDepth;
  }

  return {
    id: uid(),
    type,
    name: t.label,
    wall,
    position,
    width,
    depth,

    height: upper
      ? r.height - r.upperBottom
      : tall
        ? r.height - r.plinth
        : r.worktop - r.topThickness - r.plinth,

    bottom: upper
      ? r.upperBottom
      : r.plinth,

    front: t.front,

    colour: upper
      ? '#e5d8ca'
      : '#796c60'
  };
}

export function nextPosition(c, project) {
  const r = project.room;

  if (isCornerType(c.type)) {
    if (c.wall !== 'main') {
      return null;
    }

    const p = r.length - r.corner;

    const trial = {
      ...c,
      position: p,
      width: r.corner,
      depth: r.corner
    };

    if (
      project.cabinets.some(
        other => intersect(
          bounds(trial, r),
          bounds(other, r)
        )
      )
    ) {
      return null;
    }

    return p;
  }

  if (isBlindUpper(c.type)) {
    if (c.wall !== 'main') {
      return null;
    }

    const p = r.length - r.corner - 600;

    const trial = {
      ...c,
      position: p,
      width: 600 + r.corner,
      depth: r.upperDepth
    };

    if (
      project.cabinets.some(
        other => intersect(
          bounds(trial, r),
          bounds(other, r)
        )
      )
    ) {
      return null;
    }

    return p;
  }

  const start = c.wall === 'main'
    ? 0
    : r.corner;

  const end = c.wall === 'main'
    ? r.length - r.corner
    : r.width;

  for (
    let p = start;
    p + c.width <= end + 0.1;
    p += 10
  ) {
    const trial = {
      ...c,
      position: p
    };

    if (
      !project.cabinets.some(
        other => intersect(
          bounds(trial, r),
          bounds(other, r)
        )
      )
    ) {
      return p;
    }
  }

  return null;
}

export function addCabinet(project, type, wall) {
  if (
    isCornerType(type) ||
    isBlindUpper(type)
  ) {
    wall = 'main';
  }

  const c = defaultCabinet(
    type,
    wall,
    project.room
  );

  const pos = nextPosition(
    c,
    project
  );

  if (pos === null) {
    return null;
  }

  c.position = pos;

  project.cabinets.push(c);

  return c;
}

export function issues(project) {
  const r = project.room;
  const out = [];

  for (const c of project.cabinets) {
    const b = bounds(c, r);
    const title = c.name;

    const corner =
      isCornerType(c.type);

    const blindUpper =
      isBlindUpper(c.type);

    if (
      b.x < 0 ||
      b.z < 0 ||
      b.x + b.w > r.width + 0.1 ||
      b.z + b.d > r.length + 0.1
    ) {
      out.push({
        id: c.id,
        text: `${title}: extends outside the room.`
      });
    }

    if (
      c.bottom < 0 ||
      c.bottom + c.height > r.height + 0.1
    ) {
      out.push({
        id: c.id,
        text: `${title}: exceeds the floor or ceiling.`
      });
    }

    if (corner) {
      if (
        c.wall !== 'main' ||
        Math.abs(
          c.position -
          (r.length - r.corner)
        ) > 0.1 ||
        Math.abs(
          c.width -
          r.corner
        ) > 0.1 ||
        Math.abs(
          c.depth -
          r.corner
        ) > 0.1
      ) {
        out.push({
          id: c.id,
          text:
            `${title}: must occupy the ` +
            `${r.corner} × ${r.corner} mm corner module.`
        });
      }

    } else if (blindUpper) {

      const expectedPosition =
        r.length -
        r.corner -
        600;

      const expectedWidth =
        600 +
        r.corner;

      if (
        c.wall !== 'main' ||
        Math.abs(
          c.position -
          expectedPosition
        ) > 0.1 ||
        Math.abs(
          c.width -
          expectedWidth
        ) > 0.1 ||
        Math.abs(
          c.depth -
          r.upperDepth
        ) > 0.1
      ) {
        out.push({
          id: c.id,
          text:
            `${title}: must bridge the final 600 mm ` +
            `upper module into the ${r.corner} mm corner.`
        });
      }

    } else if (
      (
        c.wall === 'main' &&
        c.position + c.width >
        r.length - r.corner + 0.1
      ) ||
      (
        c.wall === 'return' &&
        c.position <
        r.corner - 0.1
      )
    ) {
      out.push({
        id: c.id,
        text:
          `${title}: enters the reserved corner module.`
      });
    }

    if (
      TYPES[c.type].kind === 'base' &&
      Math.abs(
        c.bottom +
        c.height +
        r.topThickness -
        r.worktop
      ) > 0.1
    ) {
      out.push({
        id: c.id,
        text:
          `${title}: top finishes at ` +
          `${Math.round(
            c.bottom +
            c.height +
            r.topThickness
          )} mm; target is ${r.worktop} mm.`
      });
    }

    if (
      TYPES[c.type].kind === 'upper' &&
      c.bottom < r.worktop
    ) {
      out.push({
        id: c.id,
        text:
          `${title}: starts below the worktop.`
      });
    }
  }

  for (
    let i = 0;
    i < project.cabinets.length;
    i++
  ) {
    for (
      let j = i + 1;
      j < project.cabinets.length;
      j++
    ) {
      const a =
        project.cabinets[i];

      const b =
        project.cabinets[j];

      if (
        intersect(
          bounds(a, r),
          bounds(b, r)
        )
      ) {
        out.push({
          id: a.id,
          text:
            `${a.name} overlaps ${b.name}.`
        });
      }
    }
  }

  return out;
}

export function available(project, wall) {
  const r = project.room;

  const start = wall === 'main'
    ? 0
    : r.corner;

  const end = wall === 'main'
    ? r.length
    : r.width;

  const occupied =
    project.cabinets
      .filter(
        c =>
          c.wall === wall &&
          TYPES[c.type].kind !== 'upper'
      )
      .map(
        c => [
          Math.max(
            start,
            c.position
          ),
          Math.min(
            end,
            c.position + c.width
          )
        ]
      )
      .filter(
        a =>
          a[1] > a[0]
      )
      .sort(
        (a, b) =>
          a[0] - b[0]
      );

  let used = 0;
  let edge = start;

  for (const [a, b] of occupied) {
    used += Math.max(
      0,
      b - Math.max(a, edge)
    );

    edge = Math.max(
      edge,
      b
    );
  }

  return Math.max(
    0,
    end - start - used
  );
}

export function draft(project) {
  const r = project.room;

  project.cabinets = [];

  // MAIN RUN
  // 5 × 600 mm modules

  for (
    const type of [
      'fridge',
      'oven',
      'hob',
      'drawers'
    ]
  ) {
    addCabinet(
      project,
      type,
      'main'
    );
  }

  // 600 × 600 BASE CORNER

  addCabinet(
    project,
    'corner',
    'main'
  );

  // RETURN

  for (
    const type of [
      'sink',
      'dishwasher'
    ]
  ) {
    addCabinet(
      project,
      type,
      'return'
    );
  }

  // MAIN UPPERS
  // First standard 600 upper above hob

  addCabinet(
    project,
    'upper',
    'main'
  );

  // Second upper above drawers
  // continues blindly into corner
  // so no exposed vertical end panel remains

  addCabinet(
    project,
    'upperBlindCorner',
    'main'
  );

  // RETURN UPPERS

  addCabinet(
    project,
    'upper',
    'return'
  );

  addCabinet(
    project,
    'upper',
    'return'
  );

  project.room = {
    ...r
  };
}

export function validateProject(value) {
  if (
    !value ||
    value.version !== 1 ||
    !value.room ||
    !Array.isArray(value.cabinets) ||
    value.cabinets.length > 100
  ) {
    throw new Error(
      'This is not a compatible kitchen project.'
    );
  }

  const v =
    JSON.parse(
      JSON.stringify(value)
    );

  const r =
    v.room;

  for (
    const [k, min, max]
    of [
      ['length', 1200, 15000],
      ['width', 1000, 15000],
      ['height', 1800, 5000],
      ['worktop', 500, 1500],
      ['topThickness', 10, 100],
      ['plinth', 0, 300],
      ['corner', 300, 1500],
      ['upperBottom', 500, 3000],
      ['depth', 200, 1200],
      ['upperDepth', 150, 800]
    ]
  ) {
    if (
      !Number.isFinite(r[k]) ||
      r[k] < min ||
      r[k] > max
    ) {
      throw new Error(
        `Invalid room value: ${k}.`
      );
    }
  }

  if (
    r.corner >= r.width ||
    r.corner >= r.length ||
    r.plinth +
    r.topThickness >=
    r.worktop ||
    r.upperBottom >=
    r.height
  ) {
    throw new Error(
      'Room heights or corner allowances are inconsistent.'
    );
  }

  for (
    const key
    of [
      'floorColour',
      'wallColour',
      'topColour'
    ]
  ) {
    if (
      !/^#[0-9a-f]{6}$/i.test(
        r[key]
      )
    ) {
      throw new Error(
        'Invalid room finish.'
      );
    }
  }

  const ids =
    new Set();

  for (
    const c
    of v.cabinets
  ) {
    // Compatibility with earlier JSON files

    if (
      c.type === 'cooktop'
    ) {
      c.type = 'hob';
    }

    if (
      c.type === 'cornerBase'
    ) {
      c.type = 'corner';
    }

    if (
      !TYPES[c.type] ||
      ![
        'main',
        'return'
      ].includes(c.wall) ||
      typeof c.id !== 'string' ||
      ids.has(c.id)
    ) {
      throw new Error(
        'Invalid cabinet type or ID.'
      );
    }

    ids.add(c.id);

    for (
      const k
      of [
        'position',
        'width',
        'depth',
        'height',
        'bottom'
      ]
    ) {
      if (
        !Number.isFinite(c[k]) ||
        c[k] < 0 ||
        c[k] > 15000 ||
        (
          k !== 'bottom' &&
          k !== 'position' &&
          c[k] < 10
        )
      ) {
        throw new Error(
          'Invalid cabinet dimensions.'
        );
      }
    }

    if (
      ![
        'single',
        'double',
        'drawers',
        'appliance'
      ].includes(c.front) ||
      !/^#[0-9a-f]{6}$/i.test(
        c.colour
      )
    ) {
      throw new Error(
        'Invalid cabinet finish.'
      );
    }

    c.name =
      String(
        c.name ||
        TYPES[c.type].label
      ).slice(
        0,
        80
      );
  }

  v.title =
    String(
      v.title ||
      'My kitchen'
    ).slice(
      0,
      100
    );

  if (
    v.reference !==
    'assets/floor-plan.jpg' &&
    !/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(
      v.reference ||
      ''
    )
  ) {
    v.reference =
      'assets/floor-plan.jpg';
  }

  v.referenceName =
    String(
      v.referenceName ||
      'Floor plan'
    ).slice(
      0,
      100
    );

  return v;
}
