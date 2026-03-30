export type Point2D = { x: number; y: number }

export type RangeRect = {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

type Node<T> = {
  x: number
  y: number
  value: T
  left: Node<T> | null
  right: Node<T> | null
  minX: number
  maxX: number
  minY: number
  maxY: number
}

export class SpatialBST<T> {
  private root: Node<T> | null

  private constructor(root: Node<T> | null) {
    this.root = root
  }

  static fromItems<T>(items: Array<{ x: number; y: number; value: T }>) {
    if (items.length === 0) return new SpatialBST<T>(null)
    const sorted = [...items].sort((a, b) => (a.x - b.x) || (a.y - b.y))
    return new SpatialBST<T>(build(sorted, 0, sorted.length - 1))
  }

  /** Returns a new tree with the point (x, y) → value inserted (or value replaced if coords match). */
  insert(x: number, y: number, value: T): SpatialBST<T> {
    return new SpatialBST<T>(insertNode(this.root, x, y, value))
  }

  /** Returns a new tree with the point at (x, y) removed.  No-op if not found. */
  remove(x: number, y: number): SpatialBST<T> {
    return new SpatialBST<T>(removeNode(this.root, x, y))
  }

  rangeQuery(rect: RangeRect): T[] {
    const out: T[] = []
    query(this.root, rect, out)
    return out
  }

  /** Returns the value of the single point closest (Euclidean) to (px, py), or null if the tree is empty. */
  nearest(px: number, py: number): T | null {
    const best = nearestNode(this.root, px, py, { node: null, dist2: Infinity })
    return best.node?.value ?? null
  }

  /**
   * Returns the k nearest values sorted by ascending distance.
   * Uses a max-heap of size k for efficiency.
   */
  nearestN(px: number, py: number, k: number): T[] {
    if (k <= 0) return []
    const heap: Array<{ node: Node<T>; dist2: number }> = []
    nearestNNode(this.root, px, py, k, heap)
    heap.sort((a, b) => a.dist2 - b.dist2)
    return heap.map(h => h.node.value)
  }

  /** Number of points stored in the tree. */
  get size(): number {
    return countNodes(this.root)
  }

  /** True if the tree contains no points. */
  get isEmpty(): boolean {
    return this.root === null
  }
}

// ─── Build ─────────────────────────────────────────────────────────────────

function build<T>(arr: Array<{ x: number; y: number; value: T }>, lo: number, hi: number): Node<T> | null {
  if (lo > hi) return null
  const mid = Math.floor((lo + hi) / 2)
  const cur = arr[mid]
  const left = build(arr, lo, mid - 1)
  const right = build(arr, mid + 1, hi)

  const minX = Math.min(cur.x, left?.minX ?? cur.x, right?.minX ?? cur.x)
  const maxX = Math.max(cur.x, left?.maxX ?? cur.x, right?.maxX ?? cur.x)
  const minY = Math.min(cur.y, left?.minY ?? cur.y, right?.minY ?? cur.y)
  const maxY = Math.max(cur.y, left?.maxY ?? cur.y, right?.maxY ?? cur.y)

  return { x: cur.x, y: cur.y, value: cur.value, left, right, minX, maxX, minY, maxY }
}

// ─── Bounds helpers ────────────────────────────────────────────────────────

function refreshBounds<T>(node: Node<T>): Node<T> {
  const { x, y, left: l, right: r } = node
  return {
    ...node,
    minX: Math.min(x, l?.minX ?? x, r?.minX ?? x),
    maxX: Math.max(x, l?.maxX ?? x, r?.maxX ?? x),
    minY: Math.min(y, l?.minY ?? y, r?.minY ?? y),
    maxY: Math.max(y, l?.maxY ?? y, r?.maxY ?? y),
  }
}

// ─── Insert ────────────────────────────────────────────────────────────────

function insertNode<T>(node: Node<T> | null, x: number, y: number, value: T): Node<T> {
  if (!node) {
    return { x, y, value, left: null, right: null, minX: x, maxX: x, minY: y, maxY: y }
  }
  const cmp = x - node.x || y - node.y
  if (cmp < 0) return refreshBounds({ ...node, left: insertNode(node.left, x, y, value) })
  if (cmp > 0) return refreshBounds({ ...node, right: insertNode(node.right, x, y, value) })
  // Same coordinates → update value in-place
  return { ...node, value }
}

// ─── Remove ────────────────────────────────────────────────────────────────

function minNode<T>(node: Node<T>): Node<T> {
  let cur = node
  while (cur.left) cur = cur.left
  return cur
}

function removeNode<T>(node: Node<T> | null, x: number, y: number): Node<T> | null {
  if (!node) return null
  const cmp = x - node.x || y - node.y
  if (cmp < 0) return refreshBounds({ ...node, left: removeNode(node.left, x, y) })
  if (cmp > 0) return refreshBounds({ ...node, right: removeNode(node.right, x, y) })
  // Found
  if (!node.left) return node.right
  if (!node.right) return node.left
  // Replace with in-order successor (leftmost of right subtree)
  const succ = minNode(node.right)
  return refreshBounds({
    ...node,
    x: succ.x,
    y: succ.y,
    value: succ.value,
    right: removeNode(node.right, succ.x, succ.y),
  })
}

// ─── Range query ───────────────────────────────────────────────────────────

function query<T>(node: Node<T> | null, rect: RangeRect, out: T[]) {
  if (!node) return
  if (node.maxX < rect.minX || node.minX > rect.maxX || node.maxY < rect.minY || node.minY > rect.maxY) return

  if (node.x >= rect.minX && node.x <= rect.maxX && node.y >= rect.minY && node.y <= rect.maxY) {
    out.push(node.value)
  }

  query(node.left, rect, out)
  query(node.right, rect, out)
}

// ─── Nearest neighbour ─────────────────────────────────────────────────────

type NNBest<T> = { node: Node<T> | null; dist2: number }

/** Minimum squared distance from point (px,py) to the bounding box of a node. */
function bboxDist2<T>(node: Node<T>, px: number, py: number): number {
  const dx = px < node.minX ? node.minX - px : px > node.maxX ? px - node.maxX : 0
  const dy = py < node.minY ? node.minY - py : py > node.maxY ? py - node.maxY : 0
  return dx * dx + dy * dy
}

function nearestNode<T>(node: Node<T> | null, px: number, py: number, best: NNBest<T>): NNBest<T> {
  if (!node) return best
  // Prune whole subtree if its bounding box is farther than current best
  if (bboxDist2(node, px, py) >= best.dist2) return best

  const d2 = (node.x - px) ** 2 + (node.y - py) ** 2
  if (d2 < best.dist2) best = { node, dist2: d2 }

  // Visit closer subtree first for better pruning
  const goLeftFirst = px < node.x || (px === node.x && py < node.y)
  if (goLeftFirst) {
    best = nearestNode(node.left, px, py, best)
    best = nearestNode(node.right, px, py, best)
  } else {
    best = nearestNode(node.right, px, py, best)
    best = nearestNode(node.left, px, py, best)
  }
  return best
}

// ─── k-Nearest neighbours (max-heap of size k) ─────────────────────────────

function nearestNNode<T>(
  node: Node<T> | null,
  px: number,
  py: number,
  k: number,
  heap: Array<{ node: Node<T>; dist2: number }>,
) {
  if (!node) return
  const worstDist2 = heap.length < k ? Infinity : heap[0].dist2
  if (bboxDist2(node, px, py) >= worstDist2) return

  const d2 = (node.x - px) ** 2 + (node.y - py) ** 2
  if (heap.length < k) {
    heap.push({ node, dist2: d2 })
    heapifyUp(heap, heap.length - 1)
  } else if (d2 < heap[0].dist2) {
    heap[0] = { node, dist2: d2 }
    heapifyDown(heap, 0)
  }

  const goLeftFirst = px < node.x || (px === node.x && py < node.y)
  if (goLeftFirst) {
    nearestNNode(node.left, px, py, k, heap)
    nearestNNode(node.right, px, py, k, heap)
  } else {
    nearestNNode(node.right, px, py, k, heap)
    nearestNNode(node.left, px, py, k, heap)
  }
}

/** Max-heap helpers (heap[0] = largest dist2 → worst in the k-set). */
function heapifyUp<T>(heap: Array<{ node: Node<T>; dist2: number }>, i: number) {
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (heap[parent].dist2 >= heap[i].dist2) break
    ;[heap[parent], heap[i]] = [heap[i], heap[parent]]
    i = parent
  }
}

function heapifyDown<T>(heap: Array<{ node: Node<T>; dist2: number }>, i: number) {
  const n = heap.length
  for (;;) {
    let largest = i
    const l = 2 * i + 1
    const r = 2 * i + 2
    if (l < n && heap[l].dist2 > heap[largest].dist2) largest = l
    if (r < n && heap[r].dist2 > heap[largest].dist2) largest = r
    if (largest === i) break
    ;[heap[largest], heap[i]] = [heap[i], heap[largest]]
    i = largest
  }
}

// ─── Count ─────────────────────────────────────────────────────────────────

function countNodes<T>(node: Node<T> | null): number {
  if (!node) return 0
  return 1 + countNodes(node.left) + countNodes(node.right)
}
