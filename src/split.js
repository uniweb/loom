/**
 * Split a ProseMirror content array at divider nodes.
 *
 * Returns an array of segments — one per region between dividers.
 * Divider nodes are consumed and do not appear in any segment.
 * A document with no dividers returns a single-element array
 * containing all nodes. An empty input returns [[]].
 *
 * @param {Array} nodes - ProseMirror content array
 * @returns {Array<Array>} Array of node arrays
 */
export function splitAtDividers(nodes) {
  if (!Array.isArray(nodes)) return [[]]
  const segments = [[]]
  for (const node of nodes) {
    if (node.type === 'divider') segments.push([])
    else segments[segments.length - 1].push(node)
  }
  return segments
}
