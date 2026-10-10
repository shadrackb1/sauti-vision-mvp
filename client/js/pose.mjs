/**
 * Pose classification from MediaPipe hand landmarks — pure geometry, no DOM.
 *
 * Landmark index map (MediaPipe hand model, 21 points):
 *   0 wrist · 1-4 thumb (CMC, MCP, IP, TIP) · 5-8 index (MCP, PIP, DIP, TIP)
 *   9-12 middle · 13-16 ring · 17-20 pinky
 *
 * A finger is "extended" when its TIP is farther from the wrist than its PIP
 * (works regardless of hand orientation, unlike tip-above-mcp heuristics).
 * The thumb is extended when the TIP-to-index-MCP distance exceeds the
 * IP-to-index-MCP distance (thumb held away from the palm).
 *
 * Output is a coarse pose label for the demo layer to map to KSL sign
 * candidates — deliberately conservative: ambiguous combinations return
 * UNKNOWN rather than a guess. A pose must hold for N consecutive frames
 * (createPoseGate) before it is confirmed, because per-frame classification
 * of a live camera is noisy. Landmarks are in normalized [0,1] image
 * coordinates, so all distances are in units of frame size.
 */
const EXTENDED = true;
const CURLED = false;

export function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function fingerExtended(landmarks, tipIndex, pipIndex) {
  const wrist = landmarks[0];
  return dist(landmarks[tipIndex], wrist) > dist(landmarks[pipIndex], wrist);
}

export function thumbExtended(landmarks) {
  // Thumb points sideways from the palm; compare its reach toward the index MCP.
  return dist(landmarks[4], landmarks[5]) > dist(landmarks[3], landmarks[5]);
}

/**
 * Classify one hand's landmarks into a coarse pose label.
 * @returns {string} one of POSE_LABELS keys
 */
export function classifyPose(landmarks) {
  if (!Array.isArray(landmarks) || landmarks.length < 21) return "UNKNOWN";

  const index = fingerExtended(landmarks, 8, 6);
  const middle = fingerExtended(landmarks, 12, 10);
  const ring = fingerExtended(landmarks, 16, 14);
  const pinky = fingerExtended(landmarks, 20, 18);
  const thumb = thumbExtended(landmarks);

  // Specific poses first
  if (thumb && !index && !middle && !ring && !pinky) return "THUMBS_UP";
  if (index && middle && !ring && !pinky) return "PEACE";
  if (index && !middle && !ring && !pinky) return "POINTING";
  if (!index && !middle && !ring && !pinky) return "FIST";
  if (index && middle && ring && pinky) return "OPEN_PALM";

  return "UNKNOWN";
}

/**
 * Factory for a synthetic MediaPipe hand (21 landmarks) with chosen finger states.
 * Used in tests; not part of the production pose pipeline.
 */
export function makeHand({ thumb = false, index = false, middle = false, ring = false, pinky = false } = {}) {
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
    pts[3] = [0.44 + side[0] * 0.42, 0.82 + side[1] * 0.42, 0]; // IP
    // Place tip between wrist and IP, say 0.15 of the way from wrist to IP.
    const wrist = [0.44, 0.82, 0];
    const ip = [0.44 + side[0] * 0.42, 0.82 + side[1] * 0.42, 0];
    const tip = [
      wrist[0] + 0.15 * (ip[0] - wrist[0]),
      wrist[1] + 0.15 * (ip[1] - wrist[1]),
      0
    ];
    pts[4] = tip;
  }
  return pts.map(([x, y, z]) => ({ x, y, z }));
}

/**
 * Debounce gate: a pose must repeat N consecutive frames before confirming,
 * and the same pose does not re-confirm until a different pose confirmed in
 * between. Keeps single noisy frames from firing sign events.
 */
export function createPoseGate({ frames = 8 } = {}) {
  let streak = 0;
  let current = null;
  let lastConfirmed = null;

  return {
    /** Submit one frame's pose label. Returns confirmed label or null. */
    submit(label) {
      if (label === "UNKNOWN") {
        streak = 0;
        current = null;
        return null;
      }
      if (label !== current) {
        current = label;
        streak = 1;
        return null;
      }
      streak += 1;
      if (streak >= frames && current !== lastConfirmed) {
        lastConfirmed = current;
        return current;
      }
      if (streak > frames * 10) streak = frames * 10; // keep bounded
      return null;
    }
  };
}

export const POSE_LABELS = {
  OPEN_PALM: "Open palm",
  FIST: "Fist",
  POINTING: "Pointing",
  THUMBS_UP: "Thumbs up",
  PEACE: "Peace",
  UNKNOWN: "Unknown pose"
};
