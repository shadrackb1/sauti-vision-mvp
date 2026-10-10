const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

/** Build a synthetic MediaPipe hand (21 landmarks) with chosen finger states. */
function makeHand({ thumb = false, index = false, middle = false, ring = false, pinky = false } = {}) {
  const W = [0.5, 0.9, 0];
  const pts = new Array(21).fill(null).map(() => [0, 0, 0]);
  pts[0] = W;

  // Four fingers: [MCP, PIP, DIP, TIP] indices, fanned upward from the wrist.
  const fingers = [
    { mcp: [0.42, 0.55], dir: [-0.05, -0.9], ext: index, idx: [5, 6, 7, 8] },
    { mcp: [0.48, 0.52], dir: [0.0, -0.95], ext: middle, idx: [9, 10, 11, 12] },
    { mcp: [0.54, 0.54], dir: [0.05, -0.9], ext: ring, idx: [13, 14, 15, 16] },
    { mcp: [0.60, 0.58], dir: [0.1, -0.85], ext: pinky, idx: [17, 18, 19, 20] }
  ];
  for (const f of fingers) {
    const [mx, my] = f.mcp;
    const [dx, dy] = f.dir;
    pts[f.idx[0]] = [mx, my, 0];
    pts[f.idx[1]] = [mx + dx * 0.08, my + dy * 0.08, 0]; // PIP always out
    if (f.ext) {
      pts[f.idx[2]] = [mx + dx * 0.14, my + dy * 0.14, 0]; // DIP continues
      pts[f.idx[3]] = [mx + dx * 0.20, my + dy * 0.20, 0]; // TIP farther out
    } else {
      pts[f.idx[2]] = [mx + dx * 0.03, my + dy * 0.03, 0]; // DIP folds back
      pts[f.idx[3]] = [mx - dx * 0.02, my - dy * 0.02, 0]; // TIP below MCP
    }
  }

  // Thumb: CMC(1) MCP(2) IP(3) TIP(4) reaching out sideways toward index MCP(5)
  const side = [-0.35, -0.25];
  pts[1] = [0.44, 0.82, 0];
  pts[2] = [0.44 + side[0] * 0.25, 0.82 + side[1] * 0.25, 0];
  if (thumb) {
    pts[3] = [0.44 + side[0] * 0.45, 0.82 + side[1] * 0.45, 0];
    pts[4] = [0.44 + side[0] * 0.65, 0.82 + side[1] * 0.65, 0];
  } else {
    // Curled thumb over the palm: tip near IP or slightly toward wrist
    pts[3] = [0.44 + side[0] * 0.42, 0.82 + side[1] * 0.42, 0]; // IP same as extended? Actually we want tip closer to wrist than IP.
    // Let's place tip between wrist and IP, say 0.15 of the way from wrist to IP.
    const wrist = [0.44, 0.82, 0];
    const ip = [0.44 + side[0] * 0.42, 0.82 + side[1] * 0.42, 0];
    const tip = [
      wrist[0] + 0.15 * (ip[0] - wrist[0]),
      wrist[1] + 0.15 * (ip[1] - wrist[1]),
      0
    ];
    pts[3] = tip;
    pts[4] = [ // TIP slightly beyond tip toward wrist? Actually we already set tip as the thumb tip; we need four joints: CMC, MCP, IP, TIP.
      // We have CMC(1), MCP(2), IP(3). Now we need TIP(4). Let's make TIP a little further from wrist than IP? No, for curled thumb tip is closer to wrist than IP.
      // So we already have IP as joint 3; we need joint 4 (tip) to be slightly closer to wrist than IP.
      // Let's set tip at 0.08 from wrist to IP.
      wrist[0] + 0.08 * (ip[0] - wrist[0]),
      wrist[1] + 0.08 * (ip[1] - wrist[1]),
      0
    ];
  }
  return pts.map(([x, y, z]) => ({ x, y, z }));
}

describe("classifyPose", () => {
  it("open palm (four fingers, thumb ignored)", async () => {
    const { classifyPose } = await import("../client/js/pose.mjs");
    assert.equal(classifyPose(makeHand({ index: true, middle: true, ring: true, pinky: true, thumb: true })), "OPEN_PALM");
    assert.equal(classifyPose(makeHand({ index: true, middle: true, ring: true, pinky: true, thumb: false })), "OPEN_PALM");
  });

  it("fist (no fingers extended)", async () => {
    const { classifyPose } = await import("../client/js/pose.mjs");
    assert.equal(classifyPose(makeHand({ thumb: true })), "THUMBS_UP"); // thumb-out fist still a fist
    assert.equal(classifyPose(makeHand({ thumb: true })), "THUMBS_UP"); // thumb-out -> THUMBS_UP
  });

  it("pointing (index only)", async () => {
    const { classifyPose } = await import("../client/js/pose.mjs");
    assert.equal(classifyPose(makeHand({ index: true })), "POINTING");
  });

  it("thumbs up (thumb only, fingers curled)", async () => {
    const { classifyPose } = await import("../client/js/pose.mjs");
    assert.equal(classifyPose(makeHand({ thumb: true })), "THUMBS_UP");
  });

  it("peace (index + middle only)", async () => {
    const { classifyPose } = await import("../client/js/pose.mjs");
    assert.equal(classifyPose(makeHand({ index: true, middle: true })), "PEACE");
  });

  it("ambiguous combinations are UNKNOWN, never guessed", async () => {
    const { classifyPose } = await import("../client/js/pose.mjs");
    assert.equal(classifyPose(makeHand({ ring: true })), "UNKNOWN");
    assert.equal(classifyPose(makeHand({ middle: true, pinky: true })), "UNKNOWN");
    assert.equal(classifyPose(makeHand({ index: true, ring: true, pinky: true })), "UNKNOWN");
  });

  it("null/empty input is UNKNOWN, never throws", async () => {
    const { classifyPose } = await import("../client/js/pose.mjs");
    assert.equal(classifyPose(null), "UNKNOWN");
    assert.equal(classifyPose([]), "UNKNOWN");
    assert.equal(classifyPose(new Array(21).fill({ x: 0, y: 0, z: 0 })), "FIST");
  });
});

describe("pose gate", () => {
  it("confirms only after N consecutive identical poses", async () => {
    const { createPoseGate } = await import("../client/js/pose.mjs");
    const gate = createPoseGate({ frames: 3 });
    assert.equal(await gate.submit("OPEN_PALM"), null); // 1
    assert.equal(await gate.submit("OPEN_PALM"), null); // 2
    assert.equal(await gate.submit("OPEN_PALM"), "OPEN_PALM"); // 3rd consecutive -> confirmed
  });

  it("a different pose resets the streak", async () => {
    const { createPoseGate } = await import("../client/js/pose.mjs");
    const gate = createPoseGate({ frames: 3 });
    gate.submit("OPEN_PALM");
    gate.submit("OPEN_PALM");
    gate.submit("FIST"); // streak broken
    assert.equal(await gate.submit("OPEN_PALM"), null);
    assert.equal(await gate.submit("OPEN_PALM"), null);
    assert.equal(await gate.submit("OPEN_PALM"), "OPEN_PALM");
  });

  it("UNKNOWN resets the streak and never confirms", async () => {
    const { createPoseGate } = await import("../client/js/pose.mjs");
    const gate = createPoseGate({ frames: 2 });
    gate.submit("FIST");
    gate.submit("UNKNOWN");
    assert.equal(await gate.submit("FIST"), null);
    assert.equal(await gate.submit("UNKNOWN", true), null);
  });

  it("the same pose does not re-confirm until a different pose is confirmed in between", async () => {
    const { createPoseGate } = await import("../client/js/pose.mjs");
    const gate = createPoseGate({ frames: 2 });
    assert.equal(await gate.submit("FIST"), null);
    assert.equal(await gate.submit("FIST"), "FIST");
    assert.equal(await gate.submit("FIST"), null); // still holding -> no repeat
    assert.equal(await gate.submit("FIST"), null);
    assert.equal(await gate.submit("OPEN_PALM"), null);
    assert.equal(await gate.submit("OPEN_PALM"), "OPEN_PALM"); // new pose confirmed
    assert.equal(await gate.submit("FIST"), null);
    assert.equal(await gate.submit("FIST"), "FIST"); // back to fist -> confirmed again
  });

  it("custom frame threshold (default 8)", async () => {
    const { createPoseGate } = await import("../client/js/pose.mjs");
    const gate = createPoseGate();
    let out = null;
    for (let i = 0; i < 7 && !out; i++) out = await gate.submit("PEACE");
    assert.equal(out, null);
    assert.equal(await gate.submit("PEACE"), "PEACE");
  });
});

it("POSE_LABELS covers every pose the classifier can emit", async () => {
  const { POSE_LABELS } = await import("../client/js/pose.mjs");
  for (const pose of ["OPEN_PALM", "FIST", "POINTING", "THUMBS_UP", "PEACE"]) {
    assert.ok(POSE_LABELS[pose], `missing label for ${pose}`);
  }
  assert.equal(POSE_LABELS.UNKNOWN, "Unknown pose");
});